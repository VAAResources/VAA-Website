/* Shared measurement only. Contact links work without JavaScript or Analytics. */
(() => {
  'use strict';
  const productionHosts = ['www.vaaresources.com', 'vaaresources.com'];
  if (window.location.protocol !== 'https:' || !productionHosts.includes(window.location.hostname)) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', 'G-029JV4R2LW');

  const tag = document.createElement('script');
  tag.async = true;
  tag.src = 'https://www.googletagmanager.com/gtag/js?id=G-029JV4R2LW';
  document.head.appendChild(tag);

  document.addEventListener('click', (event) => {
    const link = event.target.closest && event.target.closest('a[href]');
    if (!link) return;
    try {
      const destination = new URL(link.href, window.location.href);
      const placement = link.dataset.placement || 'page_link';
      // Only static labels are sent: never the email subject, body or address.
      const context = {
        placement: /^[a-z_]{1,50}$/.test(placement) ? placement : 'page_link',
        page_path: window.location.pathname
      };
      if (destination.protocol === 'mailto:' && destination.pathname.toLowerCase() === 'corporate@vaaresources.com') {
        const enquiryType = link.dataset.enquiryType;
        window.gtag('event', 'corporate_email_click', {
          ...context,
          enquiry_type: ['project', 'technical', 'corporate'].includes(enquiryType) ? enquiryType : 'corporate'
        });
      } else if (destination.origin === window.location.origin && destination.pathname === '/projects/learys-lament-holleton.html' && window.location.pathname !== destination.pathname) {
        window.gtag('event', 'project_details_click', context);
      }
    } catch (_) {
      // Measurement must never interrupt navigation or opening an email app.
    }
  });
})();
