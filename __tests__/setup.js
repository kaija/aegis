'use strict';

// Mock Chrome APIs
global.chrome = {
  runtime: {
    sendMessage: jest.fn(),
    lastError: null
  },
  storage: {
    sync: {
      get: jest.fn(),
      set: jest.fn()
    },
    local: {
      get: jest.fn(),
      set: jest.fn()
    }
  },
  i18n: {
    getMessage: jest.fn((key, subs) => {
      // Return key as-is for test visibility; substitutions are ignored in tests
      return key;
    }),
    getUILanguage: jest.fn(() => 'en')
  }
};

// Mock window object for module exports
global.window = global;

// i18n helper — mirrors src/utils/i18n.js
global.t = function t(key) {
  var subs = Array.prototype.slice.call(arguments, 1);
  if (subs.length > 0) {
    subs = subs.map(function (s) { return String(s); });
  }
  return chrome.i18n.getMessage(key, subs) || key;
};
