from core.models import Contact
from collections import Counter

all_tags = []
contacts = Contact.objects.all()
for c in contacts:
    if c.tags:
        # Normalize tags just for analysis to see if that's the issue
        all_tags.extend([t for t in c.tags if t])

counts = Counter(all_tags)
print("--- RAW TAG COUNTS IN DB ---")
for tag, count in counts.most_common():
    print(f"'{tag}': {count}")

print(f"\nTotal Unique Contacts: {contacts.count()}")
