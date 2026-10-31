// Well-known Indian companies (head office in India) whose careers pages we read for remote jobs.
// Only remote roles are imported, like every other source. Office jobs on these pages are skipped.
// `boards` are the usual names of each company's careers page; the importer tries them on
// Greenhouse, Lever and Ashby and keeps the one that answers. Only distinctive names are listed (not "jar" or
// "zeta"), so a careers page can't belong to a different company. Details an admin enters are never overwritten.
module.exports = [
  { name: 'Razorpay', website: 'https://razorpay.com', founded_year: 2014, hq_city: 'Bengaluru', boards: ['razorpay'] },
  { name: 'CRED', website: 'https://cred.club', founded_year: 2018, hq_city: 'Bengaluru', boards: ['dreamplug'] },
  { name: 'Meesho', website: 'https://www.meesho.com', founded_year: 2015, hq_city: 'Bengaluru', boards: ['meesho'] },
  { name: 'PhonePe', website: 'https://www.phonepe.com', founded_year: 2015, hq_city: 'Bengaluru', boards: ['phonepe'] },
  { name: 'ShareChat', website: 'https://sharechat.com', founded_year: 2015, hq_city: 'Bengaluru', boards: ['sharechat', 'mohallatech'] },
  { name: 'Paytm', website: 'https://paytm.com', founded_year: 2010, hq_city: 'Noida', boards: ['paytm'] },
  { name: 'Groww', website: 'https://groww.in', founded_year: 2016, hq_city: 'Bengaluru', boards: ['groww'] },
  { name: 'Swiggy', website: 'https://www.swiggy.com', founded_year: 2014, hq_city: 'Bengaluru', boards: ['swiggy'] },
  { name: 'Dream Sports', website: 'https://www.dreamsports.group', founded_year: 2008, hq_city: 'Mumbai', boards: ['dreamsports', 'dream11'] },
  { name: 'Unacademy', website: 'https://unacademy.com', founded_year: 2015, hq_city: 'Bengaluru', boards: ['unacademy'] },
  { name: 'upGrad', website: 'https://www.upgrad.com', founded_year: 2015, hq_city: 'Mumbai', boards: ['upgrad'] },
  { name: 'Juspay', website: 'https://juspay.in', founded_year: 2012, hq_city: 'Bengaluru', boards: ['juspay'] },
  { name: 'Zeta', website: 'https://www.zeta.tech', founded_year: 2015, hq_city: 'Bengaluru', boards: ['zetasuite'] },
  { name: 'InMobi', website: 'https://www.inmobi.com', founded_year: 2007, hq_city: 'Bengaluru', boards: ['inmobi'] },
  { name: 'Urban Company', website: 'https://www.urbancompany.com', founded_year: 2014, hq_city: 'Gurugram', boards: ['urbancompany', 'urbanclap'] },
  { name: 'Nykaa', website: 'https://www.nykaa.com', founded_year: 2012, hq_city: 'Mumbai', boards: ['nykaa'] },
  { name: 'Ola', website: 'https://www.olacabs.com', founded_year: 2010, hq_city: 'Bengaluru', boards: ['olacabs'] },
  { name: 'Spinny', website: 'https://www.spinny.com', founded_year: 2015, hq_city: 'Gurugram', boards: ['spinny'] },
  { name: 'Slice', website: 'https://www.sliceit.com', founded_year: 2016, hq_city: 'Bengaluru', boards: ['sliceit'] },
  { name: 'Jar', website: 'https://www.myjar.app', founded_year: 2021, hq_city: 'Bengaluru', boards: ['myjar'] },
];
