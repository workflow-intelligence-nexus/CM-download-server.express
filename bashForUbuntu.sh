#!/bin/bash
apt-get update
apt-get install curl -y &&
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.34.0/install.sh | bash &&
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
nvm install node &&
apt-get install git -y
npm install -g npm &&
npm install pm2 -g &&
npm install -g npm-cli-login &&
npm-cli-login -u general-bmt -p PASSWORD -e EMAIL &&
git clone https://support@github.com/workflow-intelligence-nexus/archive-server-collection-microsite.git &&
cd archive-server-collection-microsite &&
git checkout epic/TWITCH-3-collection-microsite &&
npm install &&
mkdir config &&
cd config &&
touch .env &&
cat >> .env <<EOF
VARIABLES FROM /config/.env
EOF
cd .. &&
pm2 startup &&
pm2 start server.js &&
pm2 save
