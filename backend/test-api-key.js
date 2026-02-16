import fetch from 'node-fetch';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('❌ GEMINI_API_KEY environment variable is required. Set it before running this test.');
  process.exit(1);
}

console.log('\n🔍 Testing Gemini API Key validity...\n');
console.log(`API Key: ${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 5)}\n`);

// Test 1: List available models
console.log('📋 Attempting to list available models...\n');

try {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  const data = await response.json();
  
  if (data.models) {
    console.log(`✅ Found ${data.models.length} available models:\n`);
    data.models.forEach(m => {
      console.log(`   - ${m.name}`);
    });
  } else if (data.error) {
    console.log(`❌ API Error: ${data.error.message}`);
    console.log(`   Code: ${data.error.code}`);
  } else {
    console.log('API Response:', JSON.stringify(data, null, 2));
  }
} catch (error) {
  console.log(`❌ Network error: ${error.message}`);
}

// Test 2: Try a simple generation request with a generic model name
console.log('\n\n📝 Attempting direct API call...\n');

try {
  const payload = {
    contents: [{
      parts: [{
        text: "Hello!"
      }]
    }]
  };
  
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  
  const data = await response.json();
  console.log(`Response Status: ${response.status}`);
  console.log('Response:', JSON.stringify(data, null, 2));
} catch (error) {
  console.log(`Error: ${error.message}`);
}
