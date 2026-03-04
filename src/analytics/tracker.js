'use strict';

/**
 * Aegis GTM Tracker
 *
 * Pushes events to window.dataLayer (processed by GTM when available).
 * On Gmail pages, GTM cannot load due to CSP strict-dynamic; events are
 * relayed to background.js and flushed to GTM the next time popup opens.
 */
const AegisTracker = (() => {

  function push(eventName, params) {
    const payload = Object.assign({ event: eventName }, params);

    if (window.__aegisDebug) {
      console.log('%c[Aegis Tracker]', 'color:#34a853;font-weight:bold', eventName, params);
    }

    // Direct push — works in popup.html / options.html where GTM is loaded
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(payload);
    } catch (_) {}

    // Relay to background queue — picked up when popup next opens
    try {
      chrome.runtime.sendMessage({ type: 'TRACK_EVENT', payload });
    } catch (_) {}
  }

  // ── Event 1: 郵件分類點擊 ────────────────────────────────────────────────
  function categoryClick(categoryId, categoryName, emailCount) {
    push('aegis_category_click', {
      category_id: categoryId,
      category_name: categoryName,
      email_count: emailCount
    });
  }

  // ── Event 2: 分析完成（分類總數）────────────────────────────────────────
  function analysisComplete(totalCategories, totalEmails, analysisMode) {
    push('aegis_analysis_complete', {
      total_categories: totalCategories,
      total_emails: totalEmails,
      analysis_mode: analysisMode
    });
  }

  // ── Event 3: 郵件操作（刪除 / 移至標籤）────────────────────────────────
  function emailAction(actionType, emailCount, categoryId, categoryName) {
    push('aegis_email_action', {
      action_type: actionType,      // 'delete' | 'move_label'
      email_count: emailCount,
      category_id: categoryId,
      category_name: categoryName
    });
  }

  // ── Event 4: 單一郵件分析 ────────────────────────────────────────────────
  function emailDetailAnalyzed(analysisMode) {
    push('aegis_email_detail_analyzed', {
      analysis_mode: analysisMode
    });
  }

  // ── Event 5: 安全判斷結果 ────────────────────────────────────────────────
  function emailSafetyResult(safetyLevel, safetyScore, categoryId, categoryName) {
    push('aegis_email_safety_result', {
      safety_level: safetyLevel,    // 'safe' | 'caution' | 'danger'
      safety_score: safetyScore,
      category_id: categoryId,
      category_name: categoryName
    });
  }

  // ── Event 6: 寄件人 TLD 網域 ─────────────────────────────────────────────
  function senderDomain(senderTld, isServiceMatch, serviceName) {
    push('aegis_sender_domain', {
      sender_tld: senderTld,
      is_service_match: isServiceMatch,
      service_name: serviceName || null
    });
  }

  // ── Event 7: 無法判斷的網域（寄件人 TLD / 連結網域）────────────────────
  function unknownDomain(domainType, domainValue) {
    push('aegis_unknown_domain', {
      domain_type: domainType,      // 'sender_tld' | 'link_domain'
      domain_value: domainValue
    });
  }

  return {
    categoryClick,
    analysisComplete,
    emailAction,
    emailDetailAnalyzed,
    emailSafetyResult,
    senderDomain,
    unknownDomain
  };
})();

window.AegisTracker = AegisTracker;
