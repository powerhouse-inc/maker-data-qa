const fs = require('fs');
const path = require('path');
const https = require('https');

function loadAccounts() {
    const filePath = path.join(__dirname, 'accounts.js');
    const content = fs.readFileSync(filePath, 'utf8');
    // Use eval to execute the JavaScript and get the array
    // This is safe as we're reading a known local file
    const accounts = eval(content.replace('export default', ''));
    return new Set(accounts.map(account => account.Address.toLowerCase()));
}

function compareAccounts() {
    const accountAddresses = loadAccounts();

    https.get('https://api.makerburn.com/expenses/adr-list', (res) => {
        let data = '';

        res.on('data', (chunk) => {
            data += chunk;
        });

        res.on('end', () => {
            try {
                const apiData = JSON.parse(data);
                const missingAddresses = apiData.filter(item => 
                    !accountAddresses.has(item.address.toLowerCase())
                ).map(item => ({
                    address: item.address,
                    cu_id: item.cu_id
                }));

                console.log("Addresses missing from accounts.js:");
                console.log(JSON.stringify(missingAddresses, null, 2));
            } catch (error) {
                console.error('Error parsing API data:', error);
            }
        });
    }).on('error', (error) => {
        console.error('Error fetching data:', error);
    });
}

compareAccounts();
