#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generate three different style logos for DeepSeek Enhancer using Doubao API.
"""

import os
import sys
import json
import time
import requests
import base64
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

# Logo styles to generate
LOGO_STYLES = [
    {
        "name": "minimalist",
        "prompt": "Logo for 'DeepSeek Enhancer': minimalist tech logo, simple geometric shapes, clean lines, lots of white space, single color or limited palette, modern tech startup feel"
    },
    {
        "name": "geometric",
        "prompt": "Logo for 'DeepSeek Enhancer': geometric abstract logo, mathematical precision, symmetrical shapes, clean angles, perfect shapes, tech architecture style"
    },
    {
        "name": "hexagonal",
        "prompt": "Logo for 'DeepSeek Enhancer': hexagonal honeycomb logo, modern tech feel, structured design, six-sided geometric pattern, blockchain or science inspired"
    }
]

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

def submit_task(prompt):
    """
    Submit an image generation task to Doubao API.
    """
    print(f"Submitting task for prompt: {prompt[:50]}...")

    # Build request body
    body = {
        "req_key": "jimeng_seedream46_cvtob",
        "prompt": prompt,
        "size": 4194304,  # 2048x2048
        "force_single": True
    }

    # Build URL with query parameters
    query = {
        "Action": "CVSync2AsyncSubmitTask",
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
        if response.status_code == 200:
            result = response.json()
            if result.get("code") == 10000:
                task_id = result["data"]["task_id"]
                print(f"Task submitted successfully. Task ID: {task_id}")
                return task_id
            else:
                print(f"Error: {result.get('message')}")
                return None
        else:
            print(f"HTTP Error: {response.status_code}")
            return None
    except Exception as e:
        print(f"Error submitting task: {e}")
        return None

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
        if response.status_code == 200:
            return response.json()
        else:
            print(f"HTTP Error: {response.status_code}")
            return None
    except Exception as e:
        print(f"Error querying task: {e}")
        return None

def save_base64_image(base64_data, output_path):
    """Save base64 encoded image to file."""
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

def wait_for_task(task_id, max_wait=60):
    """Wait for task to complete and return result."""
    start_time = time.time()
    while time.time() - start_time < max_wait:
        result = query_task(task_id)
        if result and result.get("code") == 10000:
            data = result.get("data", {})
            status = data.get("status")
            if status == "done":
                return data
            elif status in ["not_found", "expired"]:
                print(f"Task {status}")
                return None
        time.sleep(2)
    print("Timeout waiting for task")
    return None

def main():
    """Generate three different style logos."""
    print("Generating three logos for DeepSeek Enhancer")
    print("=" * 60)

    output_dir = "D:\\project\\deepseek-enhancer\\logos"
    os.makedirs(output_dir, exist_ok=True)

    generated_logos = []

    for i, style in enumerate(LOGO_STYLES):
        print(f"\n[{i+1}/3] Generating {style['name']} style logo...")

        # Submit task
        task_id = submit_task(style["prompt"])
        if not task_id:
            print(f"Failed to submit task for {style['name']} style")
            continue

        # Wait for task to complete
        print("Waiting for task to complete...")
        result_data = wait_for_task(task_id)

        if result_data:
            # Get image data
            binary_data = result_data.get("binary_data_base64", [])
            if binary_data:
                # Save first image
                output_path = os.path.join(output_dir, f"deepseek_enhancer_{style['name']}.png")
                if save_base64_image(binary_data[0], output_path):
                    generated_logos.append({
                        "style": style["name"],
                        "path": output_path,
                        "task_id": task_id
                    })
            else:
                print(f"No image data in result for {style['name']} style")
        else:
            print(f"Failed to get result for {style['name']} style")

        # Rate limiting between requests
        if i < len(LOGO_STYLES) - 1:
            time.sleep(2)

    print("\n" + "=" * 60)
    print(f"Generated {len(generated_logos)} logo(s):")
    for logo in generated_logos:
        print(f"  - {logo['style']}: {logo['path']}")

    if len(generated_logos) == 3:
        print("\nAll three logos generated successfully!")
    else:
        print(f"\nOnly {len(generated_logos)} logos generated. Some may have failed.")

if __name__ == "__main__":
    main()
