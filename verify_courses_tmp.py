#!/usr/bin/env python3
import urllib.request, re, json, time, sys
from concurrent.futures import ThreadPoolExecutor, as_completed

COLOR_MAP = {
    '#FFFFFF':'BRANCAS','#FFFF00':'AMARELAS','#0000FF':'AZUIS',
    '#FF0000':'VERMELHAS','#008000':'VERDES','#A000A0':'ROXAS',
    '#FFA500':'LARANJA','#FFD700':'DOURADAS','#C0C0C0':'PRATAS',
    '#808000':'OLIVA','#000000':'PRETAS','#DBD235':'DOURADAS',
    '#A52A2A':'CASTANHAS','#808080':'CINZENTAS','#FF69B4':'ROSAS',
    '#00FF00':'VERDES','#F0E68C':'AMARELAS','#EEE8AA':'AMARELAS',
}

def fetch(ncourse):
    url = f"https://scoring-pt.datagolf.pt/scripts/show_card.asp?ncourse={ncourse}&stat=Y&Club=ALL&ack=XH256YF45T"
    try:
        req = urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=12) as r:
            return r.read().decode('utf-8', errors='replace')
    except Exception as e:
        return None

def parse(html):
    if not html or len(html) < 500: return None
    cr_vals = re.findall(r'bgcolor=([#A-Fa-f0-9]+)[^>]*>[^<]*<font[^>]*>&nbsp;(\d+\.\d+)&nbsp;', html)
    sparts = html.split('>Slope<')
    def sl(s): return re.findall(r'bgcolor=([#A-Fa-f0-9]+)[^>]*>[^<]*<font[^>]*>&nbsp;(\d{2,3})&nbsp;', s[:2000])
    m_sl_raw = sl(sparts[1]) if len(sparts)>1 else []
    f_sl_raw = sl(sparts[2]) if len(sparts)>2 else []
    m_sl = {}
    for c,v in m_sl_raw:
        cu = c.upper()
        if cu not in m_sl: m_sl[cu] = int(v)
    f_sl = {}
    for c,v in f_sl_raw:
        cu = c.upper()
        if cu not in f_sl: f_sl[cu] = int(v)
    n_m = len(m_sl)
    m_crs = {}
    for c,v in cr_vals[:n_m]:
        cu = c.upper()
        if cu not in m_crs: m_crs[cu] = float(v)
    f_crs = {}
    for c,v in cr_vals[n_m:]:
        cu = c.upper()
        if cu not in f_crs: f_crs[cu] = float(v)
    result = {}
    for col, cr in m_crs.items():
        name = COLOR_MAP.get(col, col)
        result[f"M_{name}"] = {'cr': cr, 'slope': m_sl.get(col)}
    for col, cr in f_crs.items():
        name = COLOR_MAP.get(col, col)
        result[f"F_{name}"] = {'cr': cr, 'slope': f_sl.get(col)}
    for col, sl_val in m_sl.items():
        name = COLOR_MAP.get(col, col)
        k = f"M_{name}"
        if k not in result:
            result[k] = {'cr': None, 'slope': sl_val}
    for col, sl_val in f_sl.items():
        name = COLOR_MAP.get(col, col)
        k = f"F_{name}"
        if k not in result:
            result[k] = {'cr': None, 'slope': sl_val}
    return result

with open('public/data/master-courses.json') as f:
    mc = json.load(f)

courses = [(c, c.get('master',{}).get('name', c['courseKey']), c.get('master',{}).get('numbers',{}).get('scorecards',''))
           for c in mc['courses']
           if c.get('master',{}).get('numbers',{}).get('scorecards') and
              not c.get('master',{}).get('numbers',{}).get('scorecards','').startswith('http')]

all_changes = []
errors = []
fetched = {}

def do_fetch(item):
    c, name, sc = item
    return sc, fetch(sc)

print(f"A verificar {len(courses)} campos em paralelo...", flush=True)
with ThreadPoolExecutor(max_workers=10) as ex:
    futures = {ex.submit(do_fetch, item): item for item in courses}
    done = 0
    for fut in as_completed(futures):
        sc, html = fut.result()
        fetched[sc] = html
        done += 1
        sys.stdout.write(f'\r  {done}/{len(courses)}')
        sys.stdout.flush()

print(f'\nA comparar...', flush=True)

for c, name, sc in courses:
    tees = c.get('master',{}).get('tees', [])
    html = fetched.get(sc)
    p = parse(html)
    if not p:
        errors.append((c['courseKey'], name, sc))
        continue

    for tee in tees:
        sex = tee.get('sex','M')
        tn = tee.get('teeName','')
        r18 = tee.get('ratings',{}).get('holes18',{})
        col = tee.get('scorecardMeta',{}).get('teeColor','').upper()
        tee_name_mapped = COLOR_MAP.get(col, tn)
        key = f"{sex}_{tee_name_mapped}"
        key2 = f"{sex}_{tn}"

        live = p.get(key) or p.get(key2)
        if not live: continue

        old_cr = r18.get('courseRating') if r18 else None
        old_sl = r18.get('slopeRating') if r18 else None
        new_cr = live.get('cr')
        new_sl = live.get('slope')

        cr_changed = new_cr is not None and (old_cr is None or abs(new_cr - old_cr) > 0.05)
        sl_changed = new_sl is not None and (old_sl is None or abs(new_sl - old_sl) > 0)

        if not cr_changed and not sl_changed: continue

        susp = (old_sl and new_sl and new_sl < old_sl * 0.75)
        conf = 'SUSPEITO' if susp else ('NOVO' if old_cr is None else 'OK')

        all_changes.append({
            'key': c['courseKey'], 'name': name, 'ncourse': sc,
            'sex': sex, 'tee': tn, 'color': col,
            'old_cr': old_cr, 'new_cr': new_cr,
            'old_sl': old_sl, 'new_sl': new_sl,
            'conf': conf
        })

print(f'\nResultado: {len(all_changes)} diferenças | {len(errors)} erros\n', flush=True)
with open('verify_courses_result.json','w') as f:
    json.dump({'changes': all_changes, 'errors': errors}, f, indent=2)

by_conf = {}
for ch in all_changes:
    by_conf.setdefault(ch['conf'],[]).append(ch)

for label in ['OK','NOVO','SUSPEITO']:
    items = by_conf.get(label, [])
    if not items: continue
    print(f'=== {label} ({len(items)}) ===')
    for ch in items:
        cr_d = f"CR {ch['old_cr']}→{ch['new_cr']}" if ch['new_cr'] and (ch['old_cr'] is None or abs(ch['new_cr']-ch['old_cr'])>0.05) else ''
        sl_d = f"Slope {ch['old_sl']}→{ch['new_sl']}" if ch['new_sl'] and (ch['old_sl'] is None or abs(ch['new_sl']-ch['old_sl'])>0) else ''
        print(f"  {ch['name']:<42} {ch['sex']} {ch['tee']:<14} {cr_d} {sl_d}")
    print()

if errors:
    print(f'=== ERROS ({len(errors)}) ===')
    for key, name, sc in errors:
        print(f'  {name} ({sc})')
