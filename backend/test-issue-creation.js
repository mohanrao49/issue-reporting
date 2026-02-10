const fetch = require('node-fetch');

async function testIssueCreation() {
  try {
    // First, get a token by logging in as a citizen
    const loginResponse = await fetch('http://localhost:5000/api/auth/guest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test User' })
    });
    
    const loginData = await loginResponse.json();
    console.log('Login response:', loginData);
    
    if (!loginData.success) {
      console.error('Login failed');
      return;
    }
    
    const token = loginData.token;
    console.log('Got token:', token ? 'YES' : 'NO');
    
    // Create an issue with "The dog is dead" description
    const issueData = {
      title: 'Test Dog Issue',
      description: 'The dog is dead here, please come and clean it up',
      location: {
        name: 'Test Location',
        coordinates: {
          latitude: 16.0716,
          longitude: 77.9053
        }
      },
      category: 'Garbage & Sanitation'
    };
    
    console.log('Sending issue data:', issueData);
    
    const createResponse = await fetch('http://localhost:5000/api/issues', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(issueData)
    });
    
    const createData = await createResponse.json();
    console.log('Create response:', createData);
    
    if (createData.success && createData.data && createData.data.issue) {
      console.log('Created issue priority:', createData.data.issue.priority);
      console.log('Created issue ID:', createData.data.issue._id);
    }
    
  } catch (error) {
    console.error('Test error:', error);
  }
}

testIssueCreation();