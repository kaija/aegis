'use strict';

const DomainAnalyzer = (() => {
  // Countries commonly associated with phishing/scam hosting infrastructure
  // Sources: Spamhaus, APWG, CISA phishing statistics
  const HIGH_RISK_COUNTRIES = [
    'CN', 'RU', 'KP', 'IR', 'NG', 'UA', 'RO', 'BG', 'VN', 'PK',
    'ID', 'BR', 'EG', 'GH', 'IN', 'TZ', 'KE', 'MA', 'BY', 'MD'
  ];

  const SCORE_DEDUCTIONS = {
    AGE_HIGH_RISK: 30,     // < 1 month
    AGE_MEDIUM_RISK: 20,   // 1-3 months
    AGE_LOW_RISK: 10,      // 3-6 months
    HIGH_RISK_COUNTRY: 15,
    RDAP_UNAVAILABLE: 5,
    NO_REG_DATE: 10,
  };

  function extractBaseDomain(hostname) {
    if (!hostname) return '';
    const parts = hostname.toLowerCase().split('.');
    if (parts.length < 2) return hostname.toLowerCase();
    if (parts.length >= 3 && parts[parts.length - 2].length <= 3 &&
        ['co', 'com', 'net', 'org', 'gov', 'edu', 'ac'].includes(parts[parts.length - 2])) {
      return parts.slice(-3).join('.');
    }
    return parts.slice(-2).join('.');
  }

  function getAgeDays(dateStr) {
    if (!dateStr) return null;
    try {
      const regDate = new Date(dateStr);
      if (isNaN(regDate.getTime())) return null;
      const now = new Date();
      const diffMs = now.getTime() - regDate.getTime();
      return Math.floor(diffMs / (1000 * 60 * 60 * 24));
    } catch {
      return null;
    }
  }

  function scoreByAge(ageDays) {
    if (ageDays === null || ageDays === undefined) {
      return { deduction: 0, label: 'unknown' };
    }
    if (ageDays < 30) {
      return { deduction: SCORE_DEDUCTIONS.AGE_HIGH_RISK, label: 'high' };
    }
    if (ageDays < 90) {
      return { deduction: SCORE_DEDUCTIONS.AGE_MEDIUM_RISK, label: 'medium' };
    }
    if (ageDays < 180) {
      return { deduction: SCORE_DEDUCTIONS.AGE_LOW_RISK, label: 'low' };
    }
    return { deduction: 0, label: 'safe' };
  }

  function scoreByCountry(countryCode) {
    if (!countryCode) return { deduction: 0, isHighRisk: false };
    const isHighRisk = HIGH_RISK_COUNTRIES.includes(countryCode.toUpperCase());
    return {
      deduction: isHighRisk ? SCORE_DEDUCTIONS.HIGH_RISK_COUNTRY : 0,
      isHighRisk
    };
  }

  function calculateScore({ registrationDate, countryCode, rdapError, rdapNoDate }) {
    let score = 100;
    const scoreDetails = [];

    // RDAP error deduction
    if (rdapError) {
      score -= SCORE_DEDUCTIONS.RDAP_UNAVAILABLE;
      scoreDetails.push({ reason: 'RDAP lookup unavailable', deduction: SCORE_DEDUCTIONS.RDAP_UNAVAILABLE });
    } else if (rdapNoDate) {
      score -= SCORE_DEDUCTIONS.NO_REG_DATE;
      scoreDetails.push({ reason: 'No registration date found', deduction: SCORE_DEDUCTIONS.NO_REG_DATE });
    }

    // Domain age deduction
    if (registrationDate) {
      const ageDays = getAgeDays(registrationDate);
      const ageResult = scoreByAge(ageDays);
      if (ageResult.deduction > 0) {
        score -= ageResult.deduction;
        const ageStr = ageDays !== null ? formatAge(ageDays) : 'unknown';
        scoreDetails.push({ reason: `Domain age: ${ageStr} (${ageResult.label} risk)`, deduction: ageResult.deduction });
      }
    }

    // Country deduction
    const countryResult = scoreByCountry(countryCode);
    if (countryResult.deduction > 0) {
      score -= countryResult.deduction;
      scoreDetails.push({ reason: `Server hosted in high-risk region (${countryCode})`, deduction: countryResult.deduction });
    }

    score = Math.max(0, Math.min(100, score));

    let level, color;
    if (score >= 80) {
      level = 'safe';
      color = '#1a7f37';
    } else if (score >= 50) {
      level = 'caution';
      color = '#9a6700';
    } else {
      level = 'danger';
      color = '#cf222e';
    }

    return { score, level, color, scoreDetails };
  }

  function formatDate(dateStr) {
    if (!dateStr) return '--';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '--';
      return d.toISOString().split('T')[0];
    } catch {
      return '--';
    }
  }

  function formatAge(ageDays) {
    if (ageDays === null || ageDays === undefined) return '--';
    if (ageDays < 0) return '--';
    if (ageDays < 1) return 'Less than a day';
    if (ageDays < 30) return `${ageDays} day${ageDays === 1 ? '' : 's'}`;
    const months = Math.floor(ageDays / 30);
    if (months < 12) return `${months} month${months === 1 ? '' : 's'}`;
    const years = Math.floor(ageDays / 365);
    const remainMonths = Math.floor((ageDays % 365) / 30);
    if (remainMonths === 0) return `${years} year${years === 1 ? '' : 's'}`;
    return `${years} year${years === 1 ? '' : 's'}, ${remainMonths} month${remainMonths === 1 ? '' : 's'}`;
  }

  return {
    calculateScore,
    scoreByAge,
    scoreByCountry,
    getAgeDays,
    formatDate,
    formatAge,
    extractBaseDomain,
    HIGH_RISK_COUNTRIES,
    SCORE_DEDUCTIONS,
  };
})();

if (typeof window !== 'undefined') {
  window.DomainAnalyzer = DomainAnalyzer;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DomainAnalyzer;
}
