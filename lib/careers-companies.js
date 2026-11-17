// Well-known companies with offices in India whose careers pages (Greenhouse, Lever, Ashby, SmartRecruiters, Workable) list internships there.
// Their careers pages were checked by hand; details are public facts. Indian companies are in indian-companies.js.
// Internships in their Indian offices are imported (in office, hybrid or remote); other roles only when remote.
module.exports = [
  { name: 'Stripe', website: 'https://stripe.com', founded_year: 2010, hq_country: 'USA', hq_city: 'South San Francisco', ats_type: 'greenhouse', ats_board: 'stripe' },
  { name: 'Rubrik', website: 'https://www.rubrik.com', founded_year: 2014, hq_country: 'USA', hq_city: 'Palo Alto', ats_type: 'greenhouse', ats_board: 'rubrik' },
  // SmartRecruiters: only their Indian postings are read
  { name: 'Bosch', website: 'https://www.bosch.com', founded_year: 1886, hq_country: 'Germany', hq_city: 'Gerlingen', ats_type: 'smartrecruiters', ats_board: 'BoschGroup' },
  { name: 'ServiceNow', website: 'https://www.servicenow.com', founded_year: 2004, hq_country: 'USA', hq_city: 'Santa Clara', ats_type: 'smartrecruiters', ats_board: 'ServiceNow' },
  { name: 'Freshworks', website: 'https://www.freshworks.com', founded_year: 2010, hq_country: 'USA', hq_city: 'San Mateo', ats_type: 'smartrecruiters', ats_board: 'Freshworks' },
];
