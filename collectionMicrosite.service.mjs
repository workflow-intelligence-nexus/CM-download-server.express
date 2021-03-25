const { IconikService } = require('@workflowwin/iconik-api');
const Helper = require('./helper/helper.mjs');

module.exports = class CollectionMicrositeService {
    iconik = new IconikService({
        appId: '3b427aee-7b88-11eb-b6fa-067533028b2e',
        authToken: 'eyJhbGciOiJIUzI1NiIsImlhdCI6MTYxNjY1MDUzNiwiZXhwIjoxOTMyMDEwNTM2fQ.eyJpZCI6ImVkMmJiMGE0LThkMmItMTFlYi1hNWMxLThhYWJiYTNmYzAzMyJ9.MST0nYPE_kuAtxDc238ZY7F-Q4UzXJObbLr7goElxRQ',
        iconikUrl: 'https://preview.iconik.cloud/',
    });
    constructor() {
        this.iconik = Helper.prototype.createIconikService();
    }
    async getAssetUrls(assetId) {
        const assetURLS = {
            proxyURL: '',
            sourceURL: '',
            keyframeURL: '',
        };
        try {
            const proxy = await this.iconik.files.getProxiesOfAssetById(assetId);
            const keyframes = await this.iconik.files.getAssetKeyframes(assetId);

            const proxyURL = proxy.objects[0].url;
            const sourceURL = await this.getOriginSourceUrl(this.iconik, assetId);
            const keyframeURL = keyframes.objects?.find((keyframe) => keyframe.type === 'KEYFRAME')?.url;

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
            const originalFile = assetFiles.objects.find((asset) => asset.format_id === originalFormat.id && asset.url);
            const { url: sourceURL } = originalFile;
            console.log('asset & url', assetId, sourceURL);
            return sourceURL || '';
        } catch (error) {
            console.log(`Asset(${assetId}) has not been updated`);
            return '';
        }
    }
}
