// 在浏览器控制台运行此脚本，检查"已思考"元素的DOM结构
(() => {
  // 查找包含"已思考"文本的元素
  const allElements = document.querySelectorAll('*');
  const thinkingElements = [];

  for (const el of allElements) {
    if (el.textContent?.includes('已思考') && el.children.length === 0) {
      thinkingElements.push({
        element: el,
        tagName: el.tagName,
        className: el.className,
        innerText: el.innerText?.substring(0, 50),
        parent: {
          tagName: el.parentElement?.tagName,
          className: el.parentElement?.className,
          firstChild: el.parentElement?.children[0] === el
        },
        grandparent: {
          tagName: el.parentElement?.parentElement?.tagName,
          className: el.parentElement?.parentElement?.className
        }
      });
    }
  }

  console.log('=== "已思考" 元素分析 ===');
  thinkingElements.forEach((item, i) => {
    console.log(`\n[${i + 1}] ${item.tagName}.${item.className}`);
    console.log(`  文本: ${item.innerText}`);
    console.log(`  父级: ${item.parent.tagName}.${item.parent.className} (是否第一个子元素: ${item.parent.firstChild})`);
    console.log(`  祖父级: ${item.grandparent.tagName}.${item.grandparent.className}`);
  });

  // 检查我们的 CSS 选择器是否匹配
  const selector1 = '#root [data-ds-chatpanel] .ds-message:has(.ds-think-content) > :first-child';
  const selector2 = '.ds-think-content';

  console.log('\n=== CSS 选择器匹配检查 ===');
  console.log(`选择器 1 (${selector1}): ${document.querySelectorAll(selector1).length} 个匹配`);
  console.log(`选择器 2 (${selector2}): ${document.querySelectorAll(selector2).length} 个匹配`);

  // 如果有匹配，看看样式
  const matched = document.querySelectorAll(selector2);
  if (matched.length > 0) {
    const styles = window.getComputedStyle(matched[0]);
    console.log('\n.ds-think-content 当前样式:');
    console.log(`  background: ${styles.background}`);
    console.log(`  background-color: ${styles.backgroundColor}`);
  }

  return thinkingElements;
})();
