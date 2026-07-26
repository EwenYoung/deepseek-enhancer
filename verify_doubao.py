#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Quick verification of Doubao API image generation functionality.
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

    credentials = Credentials(VOLC_ACCESSKEY, VOLC_SECRETKEY, SERVICE, REGION)
    request = Request()
    request.host = ENDPOINT.replace("https://", "")
    request.method = method
    request.path = path
    request.query = query
    request.headers = headers
    request.body = body
    SignerV4.sign(request, credentials)
    return request.headers

def submit_task(prompt):
    """Submit an image generation task."""
    body = {
        "req_key": "jimeng_seedream46_cvtob",
        "prompt": prompt,
        "size": 4194304,  # 2048x2048
        "force_single": True
    }

    query = {
        "Action": "CVSync2AsyncSubmitTask",
        "Version": "2022-08-31"
    }

    headers = {
        "Content-Type": "application/json",
        "X-Date": datetime.now(tz=pytz.timezone('UTC')).strftime("%Y%m%dT%H%M%SZ"),
        "Host": ENDPOINT.replace("https://", ""),
    }

    if HAS_VOLCENGINE_SDK:
        headers = sign_request_with_sdk("POST", "/", query, headers, json.dumps(body))

    url = f"{ENDPOINT}?Action={query['Action']}&Version={query['Version']}"

    try:
        response = requests.post(url, json=body, headers=headers, timeout=10)
        if response.status_code == 200:
            result = response.json()
            if result.get("code") == 10000:
                return result["data"]["task_id"]
        return None
    except Exception as e:
        print(f"Error: {e}")
        return None

def query_task(task_id):
    """Query task result."""
    body = {
        "req_key": "jimeng_seedream46_cvtob",
        "task_id": task_id
    }

    query = {
        "Action": "CVSync2AsyncGetResult",
        "Version": "2022-08-31"
    }

    headers = {
        "Content-Type": "application/json",
        "X-Date": datetime.now(tz=pytz.timezone('UTC')).strftime("%Y%m%dT%H%M%SZ"),
        "Host": ENDPOINT.replace("https://", ""),
    }

    if HAS_VOLCENGINE_SDK:
        headers = sign_request_with_sdk("POST", "/", query, headers, json.dumps(body))

    url = f"{ENDPOINT}?Action={query['Action']}&Version={query['Version']}"

    try:
        response = requests.post(url, json=body, headers=headers, timeout=10)
        if response.status_code == 200:
            return response.json()
        return None
    except Exception as e:
        print(f"Error: {e}")
        return None

def main():
    """Main verification function."""
    print("验证豆包 API 生图功能")
    print("=" * 50)

    # Submit a test task
    test_prompt = "简单测试：一个蓝色圆形图标"
    print(f"提交测试任务: {test_prompt}")

    task_id = submit_task(test_prompt)
    if not task_id:
        print("❌ 任务提交失败")
        return

    print(f"任务提交成功，ID: {task_id}")

    # Wait and query result
    print("等待任务完成...")
    for i in range(10):  # Wait up to 20 seconds
        time.sleep(2)
        result = query_task(task_id)
        if result and result.get("code") == 10000:
            data = result.get("data", {})
            status = data.get("status")
            if status == "done":
                binary_data = data.get("binary_data_base64", [])
                if binary_data:
                    print(f"图片生成成功！")
                    print(f"  - 图片数量: {len(binary_data)}")
                    print(f"  - 数据大小: {len(binary_data[0])} 字符 (base64)")
                    print(f"  - 解码后大小: {len(base64.b64decode(binary_data[0]))} 字节")

                    # Save a small test image
                    output_dir = "D:\\project\\deepseek-enhancer\\logos"
                    os.makedirs(output_dir, exist_ok=True)
                    output_path = os.path.join(output_dir, "doubao_test.png")
                    with open(output_path, 'wb') as f:
                        f.write(base64.b64decode(binary_data[0]))
                    print(f"  - 测试图片已保存: {output_path}")
                    print("\n豆包生图功能正常！")
                    return
                else:
                    print("❌ 没有图片数据")
                    return
            elif status in ["not_found", "expired"]:
                print(f"❌ 任务状态: {status}")
                return
        print(f"  等待中... ({i+1}/10)")

    print("❌ 任务超时")

if __name__ == "__main__":
    main()
