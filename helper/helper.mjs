import { IconikService } from '@workflowwin/iconik-api';

export default class Helper {
    createIconikService(options = null, request = null) {
        const iconikOptions = {
            appId: '3b427aee-7b88-11eb-b6fa-067533028b2e',
            authToken: request
                ? request.headers['Auth-Token'] || request.headers['auth-token']
                : 'eyJhbGciOiJIUzI1NiIsImlhdCI6MTYxNjY1MDUzNiwiZXhwIjoxOTMyMDEwNTM2fQ.eyJpZCI6ImVkMmJiMGE0LThkMmItMTFlYi1hNWMxLThhYWJiYTNmYzAzMyJ9.MST0nYPE_kuAtxDc238ZY7F-Q4UzXJObbLr7goElxRQ',
            iconikUrl: 'https://preview.iconik.cloud/',
            ...options,
        };

        return new IconikService(iconikOptions);
    }
}
