const { IconikService } = require('@workflowwin/iconik-api');

module.exports = class Helper {
  createIconikService(options = null, request = null) {
    const iconikOptions = {
      appId: process.env.APP_ID,
      authToken: process.env.AUTH_TOKEN,
      iconikUrl: process.env.ICONIK_URL,
      ...options,
    };

    return new IconikService(iconikOptions, request);
  }
}
