// Well-known companies with offices in India whose careers pages (Greenhouse, Lever, Ashby, SmartRecruiters, Workable) list internships there.
// Their careers pages were checked by hand; details are public facts. Indian companies are in indian-companies.js.
// Internships in their Indian offices are imported (in office, hybrid or remote); other roles only when remote.
module.exports = [
  { name: 'Stripe', website: 'https://stripe.com', founded_year: 2010, hq_country: 'USA', hq_city: 'South San Francisco', ats_type: 'greenhouse', ats_board: 'stripe' },
  { name: 'Rubrik', website: 'https://www.rubrik.com', founded_year: 2014, hq_country: 'USA', hq_city: 'Palo Alto', ats_type: 'greenhouse', ats_board: 'rubrik' },
  // Internships in India found November 2026
  { name: 'HackerRank', website: 'https://www.hackerrank.com', founded_year: 2009, hq_country: 'USA', hq_city: 'Mountain View', ats_type: 'greenhouse', ats_board: 'hackerrank' },
  { name: 'Sigmoid', website: 'https://www.sigmoid.com', founded_year: 2013, ats_type: 'greenhouse', ats_board: 'sigmoid' },
  { name: 'Hevo Data', website: 'https://hevodata.com', founded_year: 2017, ats_type: 'lever', ats_board: 'hevodata' },
  // Large employers with many jobs in India, so their internships show up as soon as they post them
  { name: 'Databricks', website: 'https://www.databricks.com', founded_year: 2013, hq_country: 'USA', hq_city: 'San Francisco', ats_type: 'greenhouse', ats_board: 'databricks' },
  { name: 'MongoDB', website: 'https://www.mongodb.com', founded_year: 2007, hq_country: 'USA', hq_city: 'New York', ats_type: 'greenhouse', ats_board: 'mongodb' },
  { name: 'Okta', website: 'https://www.okta.com', founded_year: 2009, hq_country: 'USA', hq_city: 'San Francisco', ats_type: 'greenhouse', ats_board: 'okta' },
  { name: 'Zscaler', website: 'https://www.zscaler.com', founded_year: 2007, hq_country: 'USA', hq_city: 'San Jose', ats_type: 'greenhouse', ats_board: 'zscaler' },
  { name: 'Twilio', website: 'https://www.twilio.com', founded_year: 2008, hq_country: 'USA', hq_city: 'San Francisco', ats_type: 'greenhouse', ats_board: 'twilio' },
  { name: 'Elastic', website: 'https://www.elastic.co', founded_year: 2012, hq_country: 'USA', hq_city: 'San Francisco', ats_type: 'greenhouse', ats_board: 'elastic' },
  { name: 'Coinbase', website: 'https://www.coinbase.com', founded_year: 2012, hq_country: 'USA', ats_type: 'greenhouse', ats_board: 'coinbase' },
  { name: 'Datadog', website: 'https://www.datadoghq.com', founded_year: 2010, hq_country: 'USA', hq_city: 'New York', ats_type: 'greenhouse', ats_board: 'datadog' },
  { name: 'Druva', website: 'https://www.druva.com', founded_year: 2008, hq_country: 'USA', hq_city: 'Sunnyvale', ats_type: 'greenhouse', ats_board: 'druva' },
  { name: 'Netskope', website: 'https://www.netskope.com', founded_year: 2012, hq_country: 'USA', hq_city: 'Santa Clara', ats_type: 'greenhouse', ats_board: 'netskope' },
  { name: 'Commvault', website: 'https://www.commvault.com', founded_year: 1996, hq_country: 'USA', ats_type: 'greenhouse', ats_board: 'commvault' },
  { name: 'HighRadius', website: 'https://www.highradius.com', founded_year: 2006, hq_country: 'USA', hq_city: 'Houston', ats_type: 'greenhouse', ats_board: 'highradius' },
  { name: 'Harness', website: 'https://www.harness.io', founded_year: 2017, hq_country: 'USA', hq_city: 'San Francisco', ats_type: 'greenhouse', ats_board: 'harnessinc' },
  { name: 'Sumo Logic', website: 'https://www.sumologic.com', founded_year: 2010, hq_country: 'USA', ats_type: 'greenhouse', ats_board: 'sumologic' },
  { name: 'Samsara', website: 'https://www.samsara.com', founded_year: 2015, hq_country: 'USA', hq_city: 'San Francisco', ats_type: 'greenhouse', ats_board: 'samsara' },
  { name: 'Motive', website: 'https://gomotive.com', founded_year: 2013, hq_country: 'USA', hq_city: 'San Francisco', ats_type: 'greenhouse', ats_board: 'gomotive' },
  { name: 'Agoda', website: 'https://www.agoda.com', founded_year: 2005, hq_country: 'Singapore', ats_type: 'greenhouse', ats_board: 'agoda' },
  { name: 'IMC Trading', website: 'https://www.imc.com', founded_year: 1989, hq_country: 'Netherlands', hq_city: 'Amsterdam', ats_type: 'greenhouse', ats_board: 'imc' },
  { name: 'Observe.AI', website: 'https://www.observe.ai', founded_year: 2017, hq_country: 'USA', ats_type: 'greenhouse', ats_board: 'observeai' },
  { name: 'DevRev', website: 'https://devrev.ai', founded_year: 2020, hq_country: 'USA', ats_type: 'greenhouse', ats_board: 'devrev' },
  { name: 'Tekion', website: 'https://tekion.com', founded_year: 2016, hq_country: 'USA', ats_type: 'ashby', ats_board: 'tekion' },
  { name: 'Acceldata', website: 'https://www.acceldata.io', founded_year: 2018, ats_type: 'lever', ats_board: 'acceldata' },
  // SmartRecruiters: only their Indian postings are read
  { name: 'Bosch', website: 'https://www.bosch.com', founded_year: 1886, hq_country: 'Germany', hq_city: 'Gerlingen', ats_type: 'smartrecruiters', ats_board: 'BoschGroup' },
  { name: 'ServiceNow', website: 'https://www.servicenow.com', founded_year: 2004, hq_country: 'USA', hq_city: 'Santa Clara', ats_type: 'smartrecruiters', ats_board: 'ServiceNow' },
  { name: 'Freshworks', website: 'https://www.freshworks.com', founded_year: 2010, hq_country: 'USA', hq_city: 'San Mateo', ats_type: 'smartrecruiters', ats_board: 'Freshworks' },
];
