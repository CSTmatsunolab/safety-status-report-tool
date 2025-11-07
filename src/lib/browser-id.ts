// lib/browser-id.ts

/**
 * ブラウザ固有のIDを管理するユーティリティ
 * localStorageにUUIDを保存し、ユーザーごとのデータ分離を実現
 */

const BROWSER_ID_KEY = 'ssr-browser-id';

/**
 * ブラウザ固有のIDを取得する（存在しない場合は生成）
 * @returns ブラウザ固有のID
 */
export function getBrowserId(): string {
  // サーバーサイドレンダリング時はダミーIDを返す
  if (typeof window === 'undefined') {
    return 'server-side';
  }

  // 既存のIDをlocalStorageから取得
  let browserId = localStorage.getItem(BROWSER_ID_KEY);
  
  // IDが存在しない場合は新規生成
  if (!browserId) {
    browserId = generateBrowserId();
    localStorage.setItem(BROWSER_ID_KEY, browserId);
  }
  
  return browserId;
}

/**
 * 新しいブラウザIDを生成
 * @returns 生成されたUUID
 */
function generateBrowserId(): string {
  // crypto.randomUUID()を使用してUUIDを生成
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  
  // フォールバック: タイムスタンプとランダム値を組み合わせて生成
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substr(2, 9);
  return `${timestamp}-${randomPart}`;
}

/**
 * ステークホルダーIDとブラウザIDを組み合わせて
 * ユニークなネームスペースを生成
 * @param stakeholderId ステークホルダーのID
 * @param browserId ブラウザ固有のID（省略時は自動取得）
 * @returns ユニークなネームスペース
 */
export function generateNamespace(
  stakeholderId: string, 
  browserId?: string
): string {
  const id = browserId || getBrowserId();
  
  // カスタムステークホルダーの場合
  if (stakeholderId.startsWith('custom-') || stakeholderId.startsWith('custom_')) {
    // custom-またはcustom_プレフィックスを除去
    const customId = stakeholderId.replace(/^custom[-_]/, '');
    return `custom_${customId}_${id}`;
  }
  
  // 定義済みステークホルダーの場合
  return `${stakeholderId}_${id}`;
}

/**
 * ネームスペースからステークホルダーIDとブラウザIDを抽出
 * @param namespace ネームスペース文字列
 * @returns ステークホルダーIDとブラウザIDのオブジェクト
 */
export function parseNamespace(namespace: string): {
  stakeholderId: string;
  browserId: string;
} {
  // カスタムステークホルダーの場合
  if (namespace.startsWith('custom_')) {
    const parts = namespace.split('_');
    if (parts.length >= 3) {
      const browserId = parts[1];
      const customId = parts.slice(2).join('_');
      return {
        stakeholderId: `custom-${customId}`,
        browserId
      };
    }
  }
  
  // 定義済みステークホルダーの場合
  const parts = namespace.split('_');
  if (parts.length >= 2) {
    return {
      stakeholderId: parts[0],
      browserId: parts.slice(1).join('_')
    };
  }
  
  // パースできない場合はそのまま返す
  return {
    stakeholderId: namespace,
    browserId: 'unknown'
  };
}

/**
 * 現在のブラウザIDをリセット（新しいIDを生成）
 * @returns 新しく生成されたブラウザID
 */
export function resetBrowserId(): string {
  if (typeof window === 'undefined') {
    return 'server-side';
  }
  
  const newId = generateBrowserId();
  localStorage.setItem(BROWSER_ID_KEY, newId);
  return newId;
}

/**
 * デバッグ用：現在のブラウザIDとすべてのネームスペース情報を取得
 * @param stakeholders ステークホルダーのリスト
 * @returns デバッグ情報オブジェクト
 */
export function getDebugInfo(stakeholders?: Array<{ id: string; role: string }>) {
  const browserId = getBrowserId();
  const namespaces = stakeholders?.map(s => ({
    stakeholder: s.role,
    stakeholderId: s.id,
    namespace: generateNamespace(s.id, browserId)
  }));
  
  return {
    browserId,
    namespaces,
    browserIdKey: BROWSER_ID_KEY
  };
}