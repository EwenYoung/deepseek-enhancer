#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Query Doubao (豆包) API task result for logo generation.
"""

import os
import sys
import json
import time
import requests
from datetime import datetime
import pytz

# Try to import volcengine SDK
try:
    from volcengine.auth.SignerV4 import SignerV4
    from volcengine.base.Request import Request
    from volcengine.Credentials import Credentials
    HAS_VOLCENGINE_SDK = True
except ImportError:
    HAS_VOLCENGINE_SDK = False
    print("Warning: volcengine SDK not installed. Using simplified signing.")

# Volcengine credentials
VOLC_ACCESSKEY = "AKLTYmVmMWViZmFkYmJjNDA1NzkyMzY3OWFiNThiMjRjOTI"
VOLC_SECRETKEY = "T0RaaE9EazNaV1ptWTJaa05ERmlOVGhtTURWbE1qQTVOR0UxT0dOak16QQ=="

# API endpoint and service info
ENDPOINT = "https://visual.volcengineapi.com"
SERVICE = "cv"
REGION = "cn-north-1"

def sign_request_with_sdk(method, path, query, headers, body):
    """Sign request using volcengine SDK."""
    if not HAS_VOLCENGINE_SDK:
        return headers

    # Create credentials
    credentials = Credentials(VOLC_ACCESSKEY, VOLC_SECRETKEY, SERVICE, REGION)

    # Create request object
    request = Request()
    request.host = ENDPOINT.replace("https://", "")
    request.method = method
    request.path = path
    request.query = query
    request.headers = headers
    request.body = body

    # Sign the request
    SignerV4.sign(request, credentials)

    return request.headers

def query_task(task_id):
    """
    Query task result from Doubao API.
    """
    print(f"Querying task result for task_id: {task_id}")

    # Build request body
    body = {
        "req_key": "jimeng_seedream46_cvtob",
        "task_id": task_id
    }

    # Build URL with query parameters
    query = {
        "Action": "CVSync2AsyncGetResult",
        "Version": "2022-08-31"
    }

    path = "/"

    headers = {
        "Content-Type": "application/json",
        "X-Date": datetime.now(tz=pytz.timezone('UTC')).strftime("%Y%m%dT%H%M%SZ"),
        "Host": ENDPOINT.replace("https://", ""),
    }

    # Sign the request
    if HAS_VOLCENGINE_SDK:
        headers = sign_request_with_sdk("POST", path, query, headers, json.dumps(body))

    # Build full URL
    url = f"{ENDPOINT}?Action={query['Action']}&Version={query['Version']}"

    try:
        response = requests.post(url, json=body, headers=headers, timeout=10)
        print(f"Response status: {response.status_code}")
        return response.json() if response.status_code == 200 else None
    except Exception as e:
        print(f"Error querying task: {e}")
        return None

def save_base64_image(base64_data, output_path):
    """Save base64 encoded image to file."""
    import base64
    try:
        # Decode base64 data
        image_data = base64.b64decode(base64_data)
        with open(output_path, 'wb') as f:
            f.write(image_data)
        print(f"Image saved to: {output_path}")
        return True
    except Exception as e:
        print(f"Error saving image: {e}")
        return False

def download_image(url, output_path):
    """Download image from URL and save to file."""
    try:
        response = requests.get(url, timeout=30)
        if response.status_code == 200:
            with open(output_path, 'wb') as f:
                f.write(response.content)
            print(f"Image saved to: {output_path}")
            return True
        else:
            print(f"Failed to download image: {response.status_code}")
            return False
    except Exception as e:
        print(f"Error downloading image: {e}")
        return False

def main():
    """Main function to query task and download result."""
    # Use the task ID from the previous test
    task_id = "17881202572360781471"

    print("Querying Doubao API Task Result")
    print("=" * 50)

    # Query task result
    result = query_task(task_id)

    if result:
        print("\nTask query successful!")
        print("Result:", json.dumps(result, indent=2))

        # Check if task is complete
        if result.get("code") == 10000:
            data = result.get("data", {})
            status = data.get("status")

            if status == "done":
                # Get image data (binary_data_base64)
                binary_data = data.get("binary_data_base64", [])
                if binary_data:
                    print(f"\nFound {len(binary_data)} image(s)")

                    # Save images
                    output_dir = "D:\\project\\deepseek-enhancer\\logos"
                    os.makedirs(output_dir, exist_ok=True)

                    for i, b64_data in enumerate(binary_data):
                        output_path = os.path.join(output_dir, f"doubao_logo_{i+1}.png")
                        print(f"Saving image {i+1}...")
                        save_base64_image(b64_data, output_path)
                else:
                    # Try image_urls if binary_data not available
                    image_urls = data.get("image_urls", [])
                    if image_urls:
                        print(f"\nFound {len(image_urls)} image(s)")

                        # Download first image
                        output_dir = "D:\\project\\deepseek-enhancer\\logos"
                        os.makedirs(output_dir, exist_ok=True)

                        for i, url in enumerate(image_urls):
                            output_path = os.path.join(output_dir, f"doubao_logo_{i+1}.png")
                            print(f"Downloading image {i+1}...")
                            download_image(url, output_path)
                    else:
                        print("No images in result")
            else:
                print(f"Task status: {status}")
                print("Task may still be processing. Try again later.")
        else:
            print(f"Error: {result.get('message')}")
    else:
        print("\nFailed to query task result.")

    print("\n" + "=" * 50)

if __name__ == "__main__":
    main()
