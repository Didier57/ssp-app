require('dotenv').config();

module.exports = {
  JWT_SECRET: process.env.JWT_SECRET || 'ssp-openscape-secret-clean-me',
  JWT_EXPIRES: process.env.JWT_EXPIRES || '12h',
  PORT: process.env.PORT || 3001,
  APP_URL: process.env.APP_URL || 'https://ssp.damovo.cloud'
};
