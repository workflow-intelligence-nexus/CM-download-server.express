const {replaceWithCustomDomain} = require('./helper/s3-uri-util');

module.exports = class CollectionMicrositeService {
  constructor(iconik) {
    this.iconik = iconik;
  }

  async getAssetUrls(assetId) {
    try {
      const [proxy, keyframes, sourceURL] = await Promise.all([
        this.iconik.files.getProxiesOfAssetById(assetId),
        this.iconik.files.getAssetKeyframes(assetId),
        this.getOriginSourceUrl(assetId)]);
      let proxyURL = proxy.objects[0]?.url || '';
      let keyframeURL = keyframes.objects?.find((keyframe) => keyframe.type === 'KEYFRAME')?.url || '';
      if (proxyURL) {
        const customDomain = process.env.CUSTOM_DOMAIN_PROXIES;
        if (customDomain && customDomain.startsWith('http')) {
          proxyURL = replaceWithCustomDomain(proxyURL, customDomain);
        }
      }
      if (keyframeURL) {
        const customDomain = process.env.CUSTOM_DOMAIN_KEYFRAMES;
        if (customDomain && customDomain.startsWith('http')) {
          keyframeURL = replaceWithCustomDomain(keyframeURL, customDomain);
        }
      }
      return {
        proxyURL,
        keyframeURL,
        sourceURL,
      };
    } catch (error) {
      console.error('Get asset files URLs error: %O', error);
      return {
        proxyURL: '',
        keyframeURL: '',
        sourceURL: 'empty'
      };
    }
  }

  async getOriginSourceUrl(assetId) {
    try {
      const format = await this.iconik.files.getFormatsByAssetId(assetId);
      const originalFormat = format.objects.find((i) => i.name === 'ORIGINAL');
      const assetFiles = await this.iconik.files.getFilesOfAssetById(assetId, {
        generate_signed_url: true,
      });
      console.log("ASSETS", assetFiles);
      const originalFile = assetFiles.objects.find((asset) => {

        return asset.format_id === originalFormat?.id && asset.url
      });
      console.log('asset & url', assetId, originalFile?.url);
      return originalFile?.url ? originalFile.url : 'empty';

    } catch (error) {
      console.log("SOURCE", error);
      console.log(`Asset(${assetId}) has not been updated`);
      return '';
    }
  }
  async createJob(data){
    await this.iconik.jobs.createJob(data);
  }
}
