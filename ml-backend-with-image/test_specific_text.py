import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))

from app.text_rules import detect_urgency

# Test the exact text from the database
test_text = "Here the dog is dead come and clean it"
priority = detect_urgency(test_text)
print(f'Text: "{test_text}" -> Priority: {priority}')
print(f'Status: {"SUCCESS" if priority == "high" else "ISSUE"}')

# Also test variations
variations = [
    'The dog is dead',
    'dog is dead',
    'dead dog',
    'Here the dog is dead come and clean it'
]

print('\nTesting variations:')
for text in variations:
    priority = detect_urgency(text)
    print(f'  "{text}" -> {priority}')