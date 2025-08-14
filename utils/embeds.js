'use strict';

function createWarningEmbed(description, { title = 'Notice', footer } = {}) {
  return {
    title,
    description,
    color: 0xFFA500,
    footer: footer ? { text: footer } : undefined,
  };
}

function createErrorEmbed(description, { title = 'Error', footer } = {}) {
  return {
    title,
    description,
    color: 0xDC3545,
    footer: footer ? { text: footer } : undefined,
  };
}

function createInfoEmbed(description, { title = 'Info', footer } = {}) {
  return {
    title,
    description,
    color: 0x2F81F7,
    footer: footer ? { text: footer } : undefined,
  };
}

module.exports = { createWarningEmbed, createErrorEmbed, createInfoEmbed };


