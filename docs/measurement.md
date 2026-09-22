# Website measurement

## September 2026 update

`assets/site.js` loads the existing GA4 property only on the live HTTPS website
(`www.vaaresources.com` and `vaaresources.com`). Local previews, file URLs and other
hosts do not load Analytics or send custom events. Email/navigation links work
without JavaScript and if Analytics is blocked.

| Event | Meaning | Parameters |
| --- | --- | --- |
| `corporate_email_click` | One activation of a corporate mailto link | `enquiry_type`, `placement`, `page_path` |
| `project_details_click` | Navigation from another page to the Holleton project page | `placement`, `page_path` |

The former `investor_enquiry_click` was attached to a material/project enquiry
link, not an investment application. New clicks use `corporate_email_click`.
Historical data is left unchanged; do not interpret the old event as evidence
of an investor or an investment enquiry.

Custom event parameters contain static categories/placements and the source page
path, not the mailto address, subject, message or other enquiry content. Existing
Google Analytics page/session measurement remains in place.

## Reporting follow-up

- Keep `corporate_email_click` as the contact key event. No GA Admin settings
  are changed by this release. Verify the property's current setting separately.
- Register `enquiry_type` and `placement` as event-scoped custom dimensions in
  GA4 if those breakdowns are required in reports/explorations. Registration is
  not performed by website code and reporting is not retroactive.
- Do not mark `project_details_click` as a business conversion: it measures
  progression from overview to project detail, not an enquiry.
- Email clicks open an email application; they do not verify sending or delivery.
  Record actual enquiries separately and distinguish internal tests from visitors.
- Compare consistent date ranges, channel/landing-page performance and confirmed
  enquiries. Small samples and changing reporting windows are not proof of SEO
  uplift. Search Console query data is needed to assess search visibility.

Google references:
- https://developers.google.com/analytics/devguides/collection/ga4/event-parameters
- https://support.google.com/analytics/answer/13128484
