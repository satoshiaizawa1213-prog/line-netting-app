/**
 * 横長バナー広告コンポーネント
 *
 * 差し替え方法:
 *   VITE_AD_1_URL  — バナー画像の URL（ASP から取得）
 *   VITE_AD_1_LINK — クリック先 URL（ASP のアフィリエイトリンク）
 *   VITE_AD_1_ALT  — 代替テキスト
 *
 * 複数バナーを追加する場合は VITE_AD_2_* を増やしてください。
 */

const ADS = [
  {
    imageUrl: import.meta.env.VITE_AD_1_URL  as string | undefined,
    linkUrl:  import.meta.env.VITE_AD_1_LINK as string | undefined,
    alt:      import.meta.env.VITE_AD_1_ALT  as string | undefined ?? '広告',
  },
  {
    imageUrl: import.meta.env.VITE_AD_2_URL  as string | undefined,
    linkUrl:  import.meta.env.VITE_AD_2_LINK as string | undefined,
    alt:      import.meta.env.VITE_AD_2_ALT  as string | undefined ?? '広告',
  },
].filter((ad) => ad.imageUrl && ad.linkUrl)

export function AdBanner() {
  if (ADS.length === 0) return null

  // 複数ある場合はランダムに1つ表示
  const ad = ADS[Math.floor(Math.random() * ADS.length)]

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', marginBottom: 4, textAlign: 'right' }}>広告</div>
      <a href={ad.linkUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
        <img
          src={ad.imageUrl}
          alt={ad.alt}
          style={{ width: '100%', maxWidth: 320, height: 'auto', borderRadius: 8, display: 'block', margin: '0 auto' }}
        />
      </a>
    </div>
  )
}
