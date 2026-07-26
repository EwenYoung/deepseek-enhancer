#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test Doubao (豆包) API connectivity for logo generation.
Uses Volcengine's visual API for image generation.
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

def test_connection():
    """Test basic connectivity to the API endpoint."""
    print("Testing Doubao API connectivity...")

    # Test endpoint accessibility
    try:
        response = requests.get(ENDPOINT, timeout=5)
        print(f"Endpoint accessible: {response.status_code}")
    except Exception as e:
        print(f"Endpoint not accessible: {e}")
        return False

    return True

def submit_task(prompt):
    """
    Submit an image generation task to Doubao API.
    Uses volcengine SDK for signing if available.
    """
    print(f"Submitting task for prompt: {prompt}")

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
        print("Using volcengine SDK for signing...")
        headers = sign_request_with_sdk("POST", path, query, headers, json.dumps(body))
    else:
        print("Warning: Not using proper signing. Request may fail.")

    # Build full URL
    url = f"{ENDPOINT}?Action={query['Action']}&Version={query['Version']}"

    try:
        response = requests.post(url, json=body, headers=headers, timeout=10)
        print(f"Response status: {response.status_code}")
        print(f"Response: {response.text[:200]}")
        return response.json() if response.status_code == 200 else None
    except Exception as e:
        print(f"Error submitting task: {e}")
        return None

def main():
    """Main test function."""
    print("Doubao API Test Script")
    print("=" * 50)

    # Test connectivity
    if not test_connection():
        print("Cannot connect to Doubao API endpoint.")
        return

    # Test task submission
    test_prompt = "Logo for 'DeepSeek Enhancer': minimalist tech logo with geometric shapes"
    result = submit_task(test_prompt)

    if result:
        print("\nTask submitted successfully!")
        print("Result:", json.dumps(result, indent=2))
    else:
        print("\nTask submission failed.")

    print("\n" + "=" * 50)
    print("Next steps:")
    print("1. If signing works, you can generate logos with Doubao API")
    print("2. If not, check your Volcengine credentials and SDK installation")
    print("3. Set environment variables VOLC_ACCESSKEY and VOLC_SECRETKEY")

if __name__ == "__main__":
    main()
