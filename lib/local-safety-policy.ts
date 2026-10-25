export type LocalDecision = {decision:'allow'|'block';categories:string[];severity:'low'|'high'|'critical';score:number};
// Explicit demo rules, not a semantic classifier. Combat-game vocabulary alone
// is allowed; requests for real-world harm or exploitation are blocked.
const rules: {category:string;severity:'high'|'critical';pattern:RegExp}[] = [
 {category:'sexual_minors',severity:'critical',pattern:/\b(?:porn(?:ography|ographic)?|nudes?|sexual\s+(?:content|images?|acts?)|sex\s+(?:with|game|chat)|child\s+(?:sex|abuse|exploitation)|erotic)\b/i},
 {category:'self_harm',severity:'critical',pattern:/\b(?:kill\s+myself|end\s+my\s+life|commit\s+suicide|how\s+to\s+(?:self[- ]harm|hurt\s+myself)|cut\s+myself)\b/i},
 {category:'violence',severity:'high',pattern:/\b(?:make|build|create)\s+(?:a\s+)?(?:real\s+)?(?:bomb|explosive|weapon)\b|\b(?:how\s+to\s+)?(?:kill|shoot|poison|stab)\s+(?:a\s+)?(?:person|people|someone|my\s+(?:teacher|classmate|parents?))\b/i},
 {category:'bullying',severity:'high',pattern:/\b(?:bully|harass|humiliate|threaten)\s+(?:my\s+|a\s+|the\s+)?(?:classmate|teacher|student|friend|person|someone)\b/i},
 {category:'hate',severity:'high',pattern:/\b(?:racial\s+slurs?|hate\s+speech|white\s+supremacy|ethnic\s+cleansing)\b/i},
 {category:'prompt_manipulation',severity:'high',pattern:/\b(?:ignore|bypass|disable|override)\s+(?:(?:all|your|the|previous)\s+)*(?:safety|rules|instructions|restrictions|system\s+prompt)\b|\b(?:reveal|print|show)\s+(?:your\s+|the\s+)?system\s+prompt\b/i},
 {category:'malicious_code',severity:'high',pattern:/\b(?:malware|ransomware|keylogger|credential\s+steal(?:er|ing)|phishing\s+(?:page|site)|ddos)\b|\b(?:steal|exfiltrate)\s+(?:passwords?|cookies?|credentials?|tokens?)\b/i},
 {category:'privacy',severity:'high',pattern:/\b(?:collect|reveal|publish|find|share)\s+(?:(?:my|their|student|students|classmate|classmates|home|real|full|a|the)\s+)*(?:addresses?|phone\s+numbers?|passwords?|api\s+keys?|private\s+(?:emails?|photos?))\b/i},
];
export function localSafetyDecision(text:string):LocalDecision {
 const normalized=text.normalize('NFKC').replace(/[\u200b-\u200f\u2060\ufeff]/g,'');
 const hits=rules.filter(rule=>rule.pattern.test(normalized));
 return {decision:hits.length?'block':'allow',categories:[...new Set(hits.map(rule=>rule.category))],severity:hits.some(rule=>rule.severity==='critical')?'critical':hits.length?'high':'low',score:hits.length?1:0};
}
