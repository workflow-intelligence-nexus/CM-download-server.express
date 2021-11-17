const Helper = require('./helper/helper.js');

module.exports = class CollectionMicrositeService {
  iconik;

  constructor() {
    this.iconik = Helper.prototype.createIconikService({}, { fallbackApps: true, concurrent: 10 });
  }

  async getAssetUrls(assetId) {
    const assetURLS = {
      proxyURL: '',
      keyframeURL: '',
      sourceURL: '',
    };

    try {
      const [proxy, keyframes, sourceURL] = await Promise.all([
        this.iconik.files.getProxiesOfAssetById(assetId),
        this.iconik.files.getAssetKeyframes(assetId),
        this.getOriginSourceUrl(assetId)]);
      const proxyURL = proxy.objects[0]?.url || '';
      const keyframeURL = keyframes.objects?.find((keyframe) => keyframe.type === 'KEYFRAME')?.url || '';

      console.log('keyframe url', keyframeURL);
      return {
        proxyURL,
        sourceURL,
        keyframeURL,
      };
    } catch (error) {
      console.log(`Asset(${assetId}) has not been updated`);
      return assetURLS;
    }
  }

  async getOriginSourceUrl(assetId) {
    try {
      const format = await this.iconik.files.getFormatsByAssetId(assetId);
      const originalFormat = format.objects.find((i) => i.name === 'ORIGINAL');
      const assetFiles = await this.iconik.files.getFilesOfAssetById(assetId, {
        generate_signed_url: true,
      });
      const originalFile = assetFiles.objects.find((asset) => asset.format_id === originalFormat?.id && asset.url);
      console.log('asset & url', assetId, originalFile.url);
      return originalFile?.url ? originalFile.url : 'empty';

    } catch (error) {
      console.log(`Asset(${assetId}) has not been updated`);
      return '';
    }
  }
}
