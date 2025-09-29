/*
Simple test to verify our Perplexity integration works
This will test the core functionality before integrating into VS Code
*/

const fs = require('fs');
const path = require('path');

// Copy our working client from the original directory
const originalClientPath = '../src/perplexity-headless-client.js';
const testMessage = 'What is TypeScript?';

async function testPerplexityIntegration() {
    console.log('🧪 Testing Perplexity integration...');

    try {
        // Check if we can access the original client
        if (fs.existsSync(originalClientPath)) {
            console.log('✅ Original client found');

            // Import and test the client
            const { PerplexityHeadlessClient } = require(originalClientPath);
            const client = new PerplexityHeadlessClient();

            console.log('🔄 Initializing client...');
            await client.initialize();

            console.log('🔄 Loading session...');
            await client.loadSession();

            console.log('🔄 Sending test message...');
            const response = await client.sendMessage(testMessage);

            console.log('✅ Test successful!');
            console.log('📝 Response preview:', response.answer.substring(0, 100) + '...');

            await client.close();

        } else {
            console.log('❌ Original client not found at:', originalClientPath);
            console.log('📁 Current directory:', process.cwd());
            console.log('📁 Looking for files...');

            // List files in current directory
            const files = fs.readdirSync('.');
            console.log('Files:', files);
        }

    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

// Run the test
testPerplexityIntegration().then(() => {
    console.log('🏁 Test completed');
}).catch(error => {
    console.error('💥 Test crashed:', error);
});
