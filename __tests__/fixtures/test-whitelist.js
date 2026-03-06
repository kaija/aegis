'use strict';

// Test whitelist data for unit tests
module.exports = {
  services: [
    {
      name: 'Google',
      senderDomains: ['google.com', 'gmail.com'],
      baseDomains: ['google.com', 'gmail.com', 'gstatic.com'],
      keywords: ['google', 'gmail', 'google workspace']
    },
    {
      name: 'GitHub',
      senderDomains: ['github.com'],
      baseDomains: ['github.com', 'githubusercontent.com'],
      keywords: ['github', 'pull request', 'repository']
    },
    {
      name: 'Amazon',
      senderDomains: ['amazon.com', 'amazon.co.jp'],
      baseDomains: ['amazon.com', 'amazon.co.jp', 'ssl-images-amazon.com'],
      keywords: ['amazon', 'aws', 'order', 'shipment']
    },
    {
      name: 'PayPal',
      senderDomains: ['paypal.com'],
      baseDomains: ['paypal.com', 'paypalobjects.com'],
      keywords: ['paypal', 'payment']
    }
  ],
  publicEmailDomains: [
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 
    'live.com', '163.com', 'qq.com', 'mail.ru'
  ],
  suspiciousDomains: [
    'tempmail.com', '10minutemail.com', 'guerrillamail.com',
    'mailinator.com', 'throwaway.email', 'temp-mail.org'
  ],
  shortUrlServices: [
    'bit.ly', 'tinyurl.com', 'goo.gl', 't.co', 'ow.ly'
  ]
};
