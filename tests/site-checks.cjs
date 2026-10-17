'use strict';

// Run with `node tests/site-checks.cjs`. No packages, browser or network required.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const origin = 'https://www.vaaresources.com';
const projectPath = '/projects/learys-lament-holleton.html';
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function walk(directory = root) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.name.startsWith('.') || ['tests', 'docs', 'node_modules'].includes(entry.name)) return [];
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : [path.relative(root, full).replaceAll('\\', '/')];
  });
}
const files = walk();
const htmlFiles = files.filter(file => file.endsWith('.html'));
const html = new Map(htmlFiles.map(file => [file, read(file)]));
const unescape = text => text.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)]
    .map(match => [match[1].toLowerCase(), unescape(match[3])]));
}
const tags = (source, name) => [...source.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map(match => attributes(match[0]));
const ids = source => [...source.matchAll(/\bid\s*=\s*(["'])(.*?)\1/gs)].map(match => match[2]);
const pageUrl = file => `${origin}/${file === 'index.html' ? '' : file}`;
const localFile = url => decodeURIComponent(url.pathname.replace(/^\//, '') || 'index.html');

test('HTML has unique IDs, one H1, useful metadata and a single canonical URL', () => {
  const titles = new Set();
  for (const [file, source] of html) {
    const pageIds = ids(source);
    assert.equal(new Set(pageIds).size, pageIds.length, `${file}: duplicate IDs`);
    assert.equal(tags(source, 'h1').length, 1, `${file}: expected one H1`);
    const pageTitles = [...source.matchAll(/<title>(.*?)<\/title>/gs)];
    assert.equal(pageTitles.length, 1, `${file}: expected one title`);
    assert.ok(pageTitles[0][1].trim(), `${file}: empty title`);
    assert.ok(!titles.has(pageTitles[0][1]), `${file}: duplicate title`);
    titles.add(pageTitles[0][1]);
    const descriptions = tags(source, 'meta').filter(tag => tag.name === 'description');
    assert.equal(descriptions.length, 1, `${file}: expected one description`);
    assert.ok(descriptions[0].content?.trim(), `${file}: empty description`);
    const canonicals = tags(source, 'link').filter(tag => tag.rel === 'canonical');
    assert.equal(canonicals.length, 1, `${file}: expected one canonical`);
    assert.equal(canonicals[0].href, pageUrl(file), `${file}: incorrect canonical`);
    const robots = tags(source, 'meta').find(tag => tag.name === 'robots');
    assert.ok(!/noindex/i.test(robots?.content || ''), `${file}: public page is noindex`);
    const schemas = [...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
      .filter(match => attributes(match[1]).type === 'application/ld+json');
    if (file !== 'privacy.html') assert.ok(schemas.length, `${file}: no structured data`);
    for (const schema of schemas) assert.doesNotThrow(() => JSON.parse(schema[2]), `${file}: invalid JSON-LD`);
  }
});

test('Every local link, fragment, script, image and CSS image reference resolves', () => {
  function check(file, reference) {
    const url = new URL(reference, pageUrl(file));
    if (url.origin !== origin) return;
    let target = localFile(url);
    const absolute = path.resolve(root, target);
    assert.ok(absolute.startsWith(root + path.sep), `${file}: path escapes site: ${reference}`);
    assert.ok(fs.existsSync(absolute), `${file}: missing ${reference}`);
    if (fs.statSync(absolute).isDirectory()) target = `${target.replace(/\/$/, '')}/index.html`;
    assert.ok(fs.existsSync(path.join(root, target)), `${file}: missing index for ${reference}`);
    if (url.hash) {
      assert.ok(ids(read(target)).includes(decodeURIComponent(url.hash.slice(1))), `${file}: missing fragment ${reference}`);
    }
  }
  for (const [file, source] of html) {
    for (const tag of [...tags(source, 'a'), ...tags(source, 'link'), ...tags(source, 'script'), ...tags(source, 'img')]) {
      if (tag.href || tag.src) check(file, tag.href || tag.src);
    }
    for (const image of tags(source, 'img')) {
      assert.ok(Object.hasOwn(image, 'alt'), `${file}: image missing alt`);
      for (const candidate of (image.srcset || '').split(',').filter(Boolean)) check(file, candidate.trim().split(/\s+/)[0]);
    }
    for (const preload of tags(source, 'link').filter(tag => tag.as === 'image')) {
      for (const candidate of (preload.imagesrcset || '').split(',').filter(Boolean)) check(file, candidate.trim().split(/\s+/)[0]);
    }
    for (const match of source.matchAll(/url\(\s*["']?([^\s)"']+)["']?\s*\)/gi)) check(file, match[1]);
  }
});

test('Sitemap covers exactly the canonical public pages and is advertised in robots.txt', () => {
  const sitemap = read('sitemap.xml');
  const locations = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => unescape(match[1]));
  assert.equal(new Set(locations).size, locations.length, 'Duplicate sitemap URLs');
  assert.deepEqual(locations.sort(), htmlFiles.map(pageUrl).sort());
  for (const match of sitemap.matchAll(/<lastmod>(.*?)<\/lastmod>/g)) {
    assert.match(match[1], /^\d{4}-\d{2}-\d{2}$/, 'Invalid sitemap date');
    assert.ok(!Number.isNaN(Date.parse(match[1])), 'Unparseable sitemap date');
  }
  assert.match(read('robots.txt'), /Sitemap:\s*https:\/\/www\.vaaresources\.com\/sitemap\.xml/);
});

test('Public pages use corporate-only email and one shared measurement script', () => {
  for (const [file, source] of html) {
    assert.doesNotMatch(source, /\bonclick\s*=/i, `${file}: inline handler bypasses shared measurement`);
    assert.doesNotMatch(source, /investor_enquiry_click|\b(?:admin|steve)@/i, `${file}: obsolete tracking or nonpublic email`);
    const emails = source.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
    for (const email of emails) assert.equal(email.toLowerCase(), 'corporate@vaaresources.com', `${file}: noncorporate email`);
    const scripts = tags(source, 'script');
    const shared = scripts.filter(tag => tag.src === '/assets/site.js');
    assert.equal(shared.length, file === 'privacy.html' ? 0 : 1, `${file}: unexpected shared script count`);
    assert.ok(!scripts.some(tag => /googletagmanager/.test(tag.src || '')), `${file}: duplicate direct Google tag`);
    assert.doesNotMatch(source, /gtag\s*\(/, `${file}: legacy inline tracking`);
  }
  assert.doesNotMatch(read('assets/site.js'), /investor_enquiry_click|\b(?:admin|steve)@/i);
});

const measurement = read('assets/site.js');
function browser(url = `${origin}/`, initialTag) {
  const scripts = [];
  const listeners = [];
  const window = { location: new URL(url) };
  if (initialTag) window.gtag = initialTag;
  const document = {
    createElement: name => ({ tagName: name }),
    head: { appendChild: node => scripts.push(node) },
    addEventListener: (type, callback) => listeners.push({ type, callback })
  };
  vm.runInNewContext(measurement, { window, document, URL, Date }, { filename: 'assets/site.js' });
  const records = () => Array.from(window.dataLayer || [], record => Array.from(record));
  const events = () => records().filter(record => record[0] === 'event');
  function click(href, dataset = {}, isLink = true) {
    const link = { href: new URL(href, url).href, dataset };
    const event = { target: { closest: selector => isLink && selector === 'a[href]' ? link : null } };
    for (const listener of listeners.filter(item => item.type === 'click')) listener.callback(event);
  }
  return { window, scripts, listeners, records, events, click };
}

test('Production page configures Analytics and loads its tag once', () => {
  for (const host of ['www.vaaresources.com', 'vaaresources.com']) {
    const site = browser(`https://${host}/`);
    assert.equal(site.records().filter(record => record[0] === 'js').length, 1);
    assert.deepEqual(site.records().filter(record => record[0] === 'config'), [['config', 'G-029JV4R2LW']]);
    assert.equal(site.scripts.length, 1);
    assert.equal(site.scripts[0].src, 'https://www.googletagmanager.com/gtag/js?id=G-029JV4R2LW');
    assert.equal(site.scripts[0].async, true);
    assert.equal(site.listeners.filter(listener => listener.type === 'click').length, 1);
  }
});

test('Local previews, file URLs, unrelated hosts and insecure HTTP never initialise Analytics', () => {
  for (const url of ['http://localhost:8080/', 'https://localhost/', 'http://127.0.0.1:8080/', 'file:///C:/preview/index.html', 'https://preview.example/', 'http://www.vaaresources.com/', 'https://www.vaaresources.com.example/']) {
    const site = browser(url);
    assert.equal(site.scripts.length, 0, url);
    assert.equal(site.records().length, 0, url);
    assert.equal(site.listeners.length, 0, url);
  }
});

test('Corporate email clicks emit one contextual event without email URL, subject or body', () => {
  for (const enquiryType of ['project', 'technical', 'corporate']) {
    const site = browser(`${origin}/?private=secret#contact`);
    site.click('mailto:corporate@vaaresources.com?subject=Private%20subject&body=Private%20body', { enquiryType, placement: 'contact_section' });
    assert.equal(site.events().length, 1);
    const [kind, event, parameters] = site.events()[0];
    assert.equal(kind, 'event');
    assert.equal(event, 'corporate_email_click');
    assert.deepEqual(JSON.parse(JSON.stringify(parameters)), { placement: 'contact_section', page_path: '/', enquiry_type: enquiryType });
    assert.doesNotMatch(JSON.stringify(parameters), /@|mailto:|Private|secret|subject|body|\?|#/);
  }
  const fallback = browser();
  fallback.click('mailto:corporate@vaaresources.com', { enquiryType: 'private@example.com', placement: 'secret@example.com' });
  assert.equal(fallback.events()[0][2].enquiry_type, 'corporate');
  assert.equal(fallback.events()[0][2].placement, 'page_link');
  fallback.click('mailto:someone@example.com');
  fallback.click('/#contact', {}, false);
  assert.equal(fallback.events().length, 1, 'Unrelated email or non-link click was tracked');
});

test('Project navigation is measured only when coming from a different page', () => {
  const home = browser();
  home.click(`${projectPath}?ignored=secret#fraben`, { placement: 'hero' });
  assert.equal(home.events().length, 1);
  assert.equal(home.events()[0][1], 'project_details_click');
  assert.deepEqual(JSON.parse(JSON.stringify(home.events()[0][2])), { placement: 'hero', page_path: '/' });
  home.click(`https://example.com${projectPath}`);
  home.click('/#holleton');
  assert.equal(home.events().length, 1);
  const project = browser(`${origin}${projectPath}`);
  project.click('#fraben');
  project.click(projectPath);
  assert.equal(project.events().length, 0, 'Own-page navigation must not be a project-detail visit');
});

test('An Analytics failure cannot throw from a contact or project click', () => {
  const site = browser();
  site.window.gtag = () => { throw new Error('Analytics unavailable'); };
  assert.doesNotThrow(() => site.click('mailto:corporate@vaaresources.com'));
  assert.doesNotThrow(() => site.click(projectPath));
  assert.doesNotThrow(() => site.click('/technology/fraben.html'));
});

test('FRABEN navigation is tracked without double-counting same-page or external links', () => {
  const home = browser();
  home.click('/technology/fraben.html?ignored=secret#technical-enquiries', { placement: 'home_fraben' });
  assert.equal(home.events().length, 1);
  assert.equal(home.events()[0][1], 'fraben_details_click');
  assert.deepEqual(JSON.parse(JSON.stringify(home.events()[0][2])), { placement: 'home_fraben', page_path: '/' });
  home.click('https://example.com/technology/fraben.html');
  assert.equal(home.events().length, 1);
  const fraben = browser(`${origin}/technology/fraben.html`);
  fraben.click('#technical-enquiries');
  fraben.click('/technology/fraben.html');
  assert.equal(fraben.events().length, 0);
});

test('Public approvals copy stays general and 121 copy reflects the completed event', () => {
  for (const [file, source] of html) {
    const text = source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]*>/g, ' ');
    assert.doesNotMatch(text, /\bMDCP\b|Mining Development and Closure Proposal|REG210918|APP-0038487|GWL214332|60.?90 business days/i, file);
    for (const meta of tags(source, 'meta')) {
      if (/description/.test(meta.name || meta.property || '')) {
        assert.doesNotMatch(meta.content, /MDCP|lodged|lodgement/i, `${file}: detailed approval metadata`);
      }
    }
  }
  const event = html.get('updates/121-mining-investment-global-online-2026.html');
  assert.doesNotMatch(event, /will attend|will participate|VAA attending|VAA will discuss|ahead of the|EventScheduled/i);
  assert.match(event, /completed its participation/i);
  assert.match(event, /strong interest/i);
  assert.match(event, /"datePublished": "2026-09-03"/);
  assert.match(event, /"dateModified": "2026-10-17"/);
  assert.match(event, /corporate@vaaresources.com/);
});

test('FRABEN has its own discoverable page with separation-stage and development context', () => {
  const target = '/technology/fraben.html';
  for (const file of ['index.html', 'projects/learys-lament-holleton.html', 'updates/121-mining-investment-global-online-2026.html']) {
    assert.ok(tags(html.get(file), 'a').some(a => a.href === target), `${file}: FRABEN link missing`);
  }
  const source = html.get('technology/fraben.html');
  assert.match(source, /without adding chemical reagents during the separation stage/);
  assert.match(source, /separate technology-development programme/);
  assert.match(source, /may use chemical reagents/);
  assert.match(source, /data-enquiry-type="technical" data-placement="fraben_contact"/);
  assert.doesNotMatch(source, /guaranteed|commercially proven|patented|\d+\s*%\s*recovery/i);
  assert.ok(ids(html.get('projects/learys-lament-holleton.html')).includes('fraben'), 'Preserve earlier shared FRABEN anchor');
});

test('Home hero preload and image share lighter responsive variants', () => {
  const source = html.get('index.html');
  const hero = tags(source, 'img').find(img => img.src === '/images/holleton-aerial-hero.webp');
  const preload = tags(source, 'link').find(link => link.as === 'image');
  assert.equal(hero.srcset, preload.imagesrcset);
  assert.equal(hero.sizes, preload.imagesizes);
  assert.equal(hero.fetchpriority, 'high');
  assert.equal(hero.width, '2400');
  assert.equal(hero.height, '1798');
  assert.match(hero.srcset, /small.webp 800w/);
  assert.match(hero.srcset, /medium.webp 1600w/);
  const original = fs.statSync(path.join(root, 'images/holleton-aerial-hero.webp')).size;
  assert.ok(fs.statSync(path.join(root, 'images/holleton-aerial-hero-small.webp')).size < original * 0.25);
  assert.ok(fs.statSync(path.join(root, 'images/holleton-aerial-hero-medium.webp')).size < original * 0.5);
});
