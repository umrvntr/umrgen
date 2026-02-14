import fs from 'fs';
import path from 'path';

const configPath = path.resolve('d:/WOMAN/Z-IMAGE app/UI-dev/vite.config.js');
const host = 'umrgen.share.zrok.io';

function verify() {
    console.log(`Checking ${configPath} for ${host}...`);
    if (!fs.existsSync(configPath)) {
        console.error('FAIL: vite.config.js not found');
        process.exit(1);
    }

    const content = fs.readFileSync(configPath, 'utf8');

    // Check for allowedHosts array or string
    const hasAllowedHosts = content.includes('allowedHosts');
    const hasHost = content.includes(host);

    if (hasAllowedHosts && hasHost) {
        console.log(`SUCCESS: Found ${host} in allowedHosts.`);
        process.exit(0);
    } else {
        console.error(`FAIL: ${host} not found in allowedHosts config.`);
        process.exit(1);
    }
}

verify();
