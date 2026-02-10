// Using built-in fetch (Node.js 18+)

async function testPriorityFix() {
  try {
    // Wait a moment for server to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Login as guest user
    const loginResponse = await fetch('http://localhost:5001/api/auth/guest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Priority Test User' })
    });
    
    const loginData = await loginResponse.json();
    if (!loginData.success) {
      console.error('Login failed:', loginData.message);
      return;
    }
    
    const token = loginData.token;
    console.log('✅ Logged in successfully');
    
    // Create issue with "dog dead" description
    const issueData = {
      title: 'Dog Dead Test Issue',
      description: 'The dog is dead here, please come and clean it up immediately',
      location: {
        name: 'Test Location',
        coordinates: {
          latitude: 16.0716,
          longitude: 77.9053
        }
      },
      category: 'Garbage & Sanitation'
    };
    
    console.log('📤 Sending issue data:', issueData);
    
    const createResponse = await fetch('http://localhost:5001/api/issues', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(issueData)
    });
    
    const createData = await createResponse.json();
    console.log('📥 Create response:', createData);
    
    if (createData.success && createData.data && createData.data.issue) {
      const issue = createData.data.issue;
      console.log('✅ Issue created successfully!');
      console.log('📋 Issue Details:');
      console.log('  ID:', issue._id);
      console.log('  Title:', issue.title);
      console.log('  Description:', issue.description.substring(0, 50) + '...');
      console.log('  Priority:', issue.priority);
      console.log('  Category:', issue.category);
      console.log('  Created At:', issue.createdAt);
      
      if (issue.priority === 'high') {
        console.log('🎉 SUCCESS: Issue correctly detected as HIGH priority!');
      } else {
        console.log('❌ ISSUE: Issue still showing as', issue.priority, 'priority instead of high');
      }
    } else {
      console.error('❌ Failed to create issue:', createData.message);
    }
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
}

testPriorityFix();