import { IconikService } from '@workflowwin/iconik-api';

export function createIconikService(options = null, request = null) {
    const iconikOptions = {
        appId: process.env.ICONIK_APP_ID,
        authToken: request
            ? request.headers['Auth-Token'] || request.headers['auth-token']
            : process.env.ICONIK_AUTH_TOKEN,
        iconikUrl: process.env.ICONIK_URL,
        systemDomainId: process.env.ICONIK_SYSTEM_DOMAIN_ID,
        ...options,
    };

    return new IconikService(iconikOptions);
}
