window.VOTE_CONFIG = {
  title: 'バチ納め衣装決め投票',
  // Google Apps Script の公開URL
  apiUrl: 'https://script.google.com/macros/s/AKfycbxZmxUpd3XRD3YEvPie2iJPMIuzL0scze_PIKKReqRjmn2enIX8xWSwFOWteFGUzAuIsA/exec',
  // true のあいだはデモモード（投票はその端末の中だけに保存され、本番の集計に入らない）
  // 本番を始めるときに false にする。apiUrl が空のときも自動でデモモードになる
  demo: true,
  itemCount: 14,
};
