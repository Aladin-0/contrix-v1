from core.models import Contact, ContactCategory

# Get all unique tags
all_tags = set()
for contact in Contact.objects.all():
    if contact.tags:
        for tag in contact.tags:
            if tag and tag.strip():
                all_tags.add(tag.strip())

print(f"Found tags to sync: {all_tags}")

created_count = 0
for tag_name in all_tags:
    # Check if category exists (case-insensitive check could be good but let's stick to exact for now to match tags)
    obj, created = ContactCategory.objects.get_or_create(
        name=tag_name,
        defaults={'description': f'Auto-created category for {tag_name}'}
    )
    if created:
        print(f"Created category: {tag_name}")
        created_count += 1
    else:
        print(f"Category already exists: {tag_name}")

print(f"Done. Synced {len(all_tags)} tags to categories. Created {created_count} new.")
