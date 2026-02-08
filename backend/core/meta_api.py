import requests
import logging
import io
import cloudinary
import cloudinary.uploader
from django.conf import settings
from PIL import Image, ImageDraw, ImageFont

logger = logging.getLogger(__name__)

# Configure Cloudinary
cloudinary.config(
  cloud_name = settings.CLOUDINARY_CLOUD_NAME,
  api_key = settings.CLOUDINARY_API_KEY,
  api_secret = settings.CLOUDINARY_API_SECRET,
  secure = True
)

def generate_text_image(text, width=1080, height=1080):
    """Generate an Instagram-compatible image from text with auto-scaling font."""
    img = Image.new('RGB', (width, height), color='#ffffff')
    draw = ImageDraw.Draw(img)
    
    # Create gradient background (Instagram style: Purple to Orange)
    for y in range(height):
        ratio = y / height
        r = int(131 + (247 - 131) * ratio)
        g = int(58 + (119 - 58) * ratio)
        b = int(180 + (55 - 180) * ratio)
        draw.rectangle([(0, y), (width, y+1)], fill=(r, g, b))
    
    # Auto-scale font size
    padding = 60
    max_width = width - (padding * 2)
    max_height = height - (padding * 2)
    
    font_size = 90  # Start large
    min_font_size = 20
    final_font = None
    final_lines = []
    final_line_height = 0
    
    while font_size >= min_font_size:
        try:
            # Try to use a system font if available
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
        except IOError:
            try:
                font = ImageFont.load_default(size=font_size)
            except TypeError:
                font = ImageFont.load_default()
        
        # Word wrap calculation
        words = text.split()
        lines = []
        current_line = []
        
        for word in words:
            test_line = ' '.join(current_line + [word])
            bbox = draw.textbbox((0, 0), test_line, font=font)
            text_w = bbox[2] - bbox[0]
            
            if text_w < max_width:
                current_line.append(word)
            else:
                if current_line:
                    lines.append(' '.join(current_line))
                current_line = [word]
        
        if current_line:
            lines.append(' '.join(current_line))
        
        # Check total height
        line_height = int(font_size * 1.5)
        total_text_height = len(lines) * line_height
        
        if total_text_height <= max_height:
            # It fits!
            final_font = font
            final_lines = lines
            final_line_height = line_height
            break
        
        font_size -= 5  # Reduce size and try again
    
    # If even min size doesn't fit (very rare), use min size and truncate or let it overflow (using last config)
    if final_font is None:
         # Use the smallest calculated config
         final_font = font
         final_lines = lines
         final_line_height = line_height

    # Draw text centered
    total_text_height = len(final_lines) * final_line_height
    y_offset = (height - total_text_height) // 2
    
    for line in final_lines:
        bbox = draw.textbbox((0, 0), line, font=final_font)
        text_width = bbox[2] - bbox[0]
        x = (width - text_width) // 2
        
        # Draw shadow
        shadow_offset = max(2, int(font_size / 20))
        draw.text((x+shadow_offset, y_offset+shadow_offset), line, font=final_font, fill='#000000')
        # Draw text
        draw.text((x, y_offset), line, font=final_font, fill='#ffffff')
        y_offset += final_line_height
    
    # Save to bytes
    img_bytes = io.BytesIO()
    img.save(img_bytes, format='JPEG', quality=95)
    img_bytes.seek(0)
    
    return img_bytes

def upload_image_to_cloudinary(image_bytes):
    """Upload image to Cloudinary and return secure URL."""
    try:
        upload_result = cloudinary.uploader.upload(image_bytes, resource_type="image")
        return True, upload_result['secure_url']
    except Exception as e:
        logger.error(f"Cloudinary upload error: {e}")
        return False, str(e)

def get_page_access_token():
    """Exchange User Token for Page Access Token."""
    try:
        url = f"https://graph.facebook.com/{settings.META_API_VERSION}/{settings.META_FACEBOOK_PAGE_ID}"
        params = {
            "fields": "access_token",
            "access_token": settings.META_ACCESS_TOKEN
        }
        response = requests.get(url, params=params, timeout=10)
        if response.status_code == 200:
            token = response.json().get('access_token')
            logger.info("Successfully retrieved Page Access Token")
            return token
        else:
            logger.warning(f"Could not get Page Token, using default. Status: {response.status_code}, Resp: {response.text}")
            return settings.META_ACCESS_TOKEN
    except Exception as e:
        logger.error(f"Error fetching Page Token: {e}")
        return settings.META_ACCESS_TOKEN

def post_to_facebook_page(message_text):
    """Post text message to Facebook Page feed."""
    url = f"https://graph.facebook.com/{settings.META_API_VERSION}/{settings.META_FACEBOOK_PAGE_ID}/feed"
    
    # Get Page Token (required for posting as Page)
    page_token = get_page_access_token()
    
    payload = {
        "message": message_text,
        "access_token": page_token
    }
    
    try:
        response = requests.post(url, data=payload, timeout=10)
        if response.status_code == 200:
            post_id = response.json().get('id')
            logger.info(f"Facebook post created: {post_id}")
            return True, post_id
        else:
            logger.error(f"Facebook API Error: {response.text}")
            return False, response.text
    except Exception as e:
        logger.error(f"Facebook API Exception: {e}")
        return False, str(e)

def post_to_instagram_account(message_text):
    """
    Post text to Instagram by generating an image and posting it.
    """
    try:
        # Generate image from text
        image_bytes = generate_text_image(message_text)
        
        # Upload to Cloudinary to get public URL
        success, image_url = upload_image_to_cloudinary(image_bytes)
        if not success:
            return False, f"Image upload failed: {image_url}"
        
        logger.info(f"Image uploaded to: {image_url}")
        
        # Step 1: Create media container
        container_url = f"https://graph.facebook.com/{settings.META_API_VERSION}/{settings.META_INSTAGRAM_ACCOUNT_ID}/media"
        
        container_payload = {
            "image_url": image_url,
            "caption": message_text,
            "access_token": settings.META_ACCESS_TOKEN
        }
        
        container_response = requests.post(container_url, data=container_payload, timeout=15)
        if container_response.status_code != 200:
            return False, f"Container creation failed: {container_response.text}"
        
        container_id = container_response.json().get('id')
        logger.info(f"Instagram container created: {container_id}")
        
        # Step 1.5: Wait for container to be ready
        import time
        for _ in range(5):  # Try 5 times
            time.sleep(3)   # Wait 3 seconds
            status_url = f"https://graph.facebook.com/{settings.META_API_VERSION}/{container_id}"
            status_params = {
                "fields": "status_code",
                "access_token": settings.META_ACCESS_TOKEN
            }
            status_res = requests.get(status_url, params=status_params)
            if status_res.status_code == 200:
                status_code = status_res.json().get('status_code')
                if status_code == 'FINISHED':
                    break
                elif status_code == 'ERROR':
                     return False, f"Container processing error: {status_res.text}"
            logger.info(f"Waiting for container {container_id}, status: {status_res.json().get('status_code')}")
        
        # Step 2: Publish container
        publish_url = f"https://graph.facebook.com/{settings.META_API_VERSION}/{settings.META_INSTAGRAM_ACCOUNT_ID}/media_publish"
        publish_payload = {
            "creation_id": container_id,
            "access_token": settings.META_ACCESS_TOKEN
        }
        
        publish_response = requests.post(publish_url, data=publish_payload, timeout=15)
        if publish_response.status_code == 200:
            post_id = publish_response.json().get('id')
            logger.info(f"Instagram post created: {post_id}")
            return True, post_id
        else:
            return False, f"Publish failed: {publish_response.text}"
            
    except Exception as e:
        logger.error(f"Instagram API Exception: {e}")
        return False, str(e)
