import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))

from app.text_rules import detect_urgency

# Test the priority detection
test_text = "The dog is dead"
priority = detect_urgency(test_text)
print(f'Text: "{test_text}" -> Priority: {priority}')
print(f'ML backend working correctly: {priority == "high"}')