import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))

from app.text_rules import detect_urgency, normalize, contains

# Test the priority detection
test_cases = [
    "The dog is dead",
    "dead animal",
    "dead body",
    "fire in the building", 
    "gas leak detected",
    "building collapse",
    "broken road",
    "garbage overflow",
    "normal issue"
]

print("Testing priority detection:")
print("-" * 50)

for text in test_cases:
    priority = detect_urgency(text)
    print(f"Text: '{text}' -> Priority: {priority}")
    
    # Debug the contains function
    normalized = normalize(text)
    has_dead = contains(normalized, "dead")
    print(f"  Normalized: '{normalized}'")
    print(f"  Contains 'dead': {has_dead}")
    print()