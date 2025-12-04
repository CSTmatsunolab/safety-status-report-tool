export function formatDate(date: Date | string): string {
  const d = new Date(date);
  
  const formatter = new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Tokyo'
  });
  
  const parts = formatter.formatToParts(d);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || '';
  
  return `${getPart('year')}年${getPart('month')}月${getPart('day')}日 ${getPart('hour')}:${getPart('minute')}`;
}