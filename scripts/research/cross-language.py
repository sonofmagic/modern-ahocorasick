"""Pinned source benchmark; no native dependencies enter the JavaScript package.
Usage: python3 scripts/research/cross-language.py CACHE --prepare
       python3 scripts/research/cross-language.py CACHE --run > results.json
Build tools: Rust/Cargo, Go >=1.23, Java >=8, Python venv/pip, Node (build dist first).
"""
import hashlib, io, json, os, pathlib, platform, re, shutil, subprocess, sys, tarfile, urllib.request
ROOT = pathlib.Path(__file__).resolve().parents[2]
HERE = pathlib.Path(__file__).resolve().parent
CACHE = pathlib.Path(sys.argv[1]).resolve()
SOURCES = json.loads((ROOT / 'docs/research/sources.json').read_text())
REPOS = ['BurntSushi/aho-corasick', 'daac-tools/daachorse', 'BobuSumisu/aho-corasick', 'robert-bor/aho-corasick']
def run(args, cwd=None):
    subprocess.run(args, cwd=cwd, check=True, stdout=sys.stderr)
def prepare():
    CACHE.mkdir(parents=True, exist_ok=True)
    dirs = {}
    for repo in REPOS:
        entry = next(x for x in SOURCES['repositories'] if x['repository'] == repo)
        dest = CACHE / repo.replace('/', '__')
        if not dest.exists():
            data = urllib.request.urlopen(f"https://api.github.com/repos/{repo}/tarball/{entry['commit']}", timeout=120).read()
            dest.mkdir()
            tarfile.open(fileobj=io.BytesIO(data), mode='r:gz').extractall(dest, filter='data')
        dirs[repo] = next(x for x in dest.iterdir() if x.is_dir())
    rust = CACHE / 'rust'; (rust / 'src').mkdir(parents=True, exist_ok=True)
    deps = '\n'.join(name + ' = { path = ' + json.dumps(str(dirs[repo])) + ' }' for name, repo in [('aho-corasick', REPOS[0]), ('daachorse', REPOS[1])])
    (rust / 'Cargo.toml').write_text('[package]\nname="ac-survey"\nversion="0.0.0"\nedition="2021"\n[dependencies]\n' + deps + '\nmemchr = \"=2.8.3\"\n')
    shutil.copyfile(HERE / 'bench.rs', rust / 'src/main.rs')
    run(['cargo', 'build', '--release'], rust)
    go = CACHE / 'go'; go.mkdir(exist_ok=True)
    (go / 'go.mod').write_text('module ac-survey\ngo 1.23\nrequire github.com/BobuSumisu/aho-corasick v0.0.0\nreplace github.com/BobuSumisu/aho-corasick => ' + str(dirs[REPOS[2]]) + '\n')
    shutil.copyfile(HERE / 'bench.go', go / 'main.go'); run(['go', 'build', '-o', 'bench', '.'], go)
    java = CACHE / 'java'; java.mkdir(exist_ok=True)
    javafiles = list((dirs[REPOS[3]] / 'src/main/java').rglob('*.java'))
    run(['javac', '-d', str(java), *map(str, javafiles), str(HERE / 'Bench.java')])
    run([sys.executable, '-m', 'venv', str(CACHE / 'venv')])
    run([str(CACHE / 'venv/bin/pip'), 'install', 'pyahocorasick==2.3.1'])
    (CACHE / 'pins.json').write_text(json.dumps({x['repository']: x['commit'] for x in SOURCES['repositories'] if x['repository'] in REPOS}, indent=2))
def measure():
    variants = {
        'rust': [str(CACHE / 'rust/target/release/ac-survey'), 'rust'],
        'daachorse': [str(CACHE / 'rust/target/release/ac-survey'), 'daachorse'],
        'go-bobusumisu': [str(CACHE / 'go/bench')],
        'java-robert-bor': ['java', '-cp', str(CACHE / 'java'), 'Bench'],
        'python-pyahocorasick': [str(CACHE / 'venv/bin/python'), str(HERE / 'bench.py')],
        'modern': ['node', '--expose-gc', str(HERE / 'bench.mjs')],
    }
    patterns = [f'word{i}' for i in range(200)]
    scenarios = {'ordinary': ' '.join(f'line word{i%200} end' for i in range(2000)), 'sparse': 'ordinary text without hits. ' * 2000, 'late': 'ordinary text ' * 5000 + 'word199'}
    records = []
    for scenario, text in scenarios.items():
        p = CACHE / 'patterns.txt'; p.write_text('\n'.join(patterns) + '\n')
        t = CACHE / 'text.txt'; t.write_text(text)
        expected = []
        for i, pattern in enumerate(patterns):
            start = text.find(pattern)
            while start != -1:
                expected.append((start, start+len(pattern), i)); start = text.find(pattern, start+1)
        truth = (len(expected), sum(sum(hit) for hit in expected))
        for round_index in range(3):
            order = list(variants.items())
            if round_index % 2: order.reverse()
            for variant, cmd in order:
                print(f'{scenario} / {variant} / {round_index+1}', file=sys.stderr)
                time_args = ['/usr/bin/time', '-l'] if platform.system() == 'Darwin' else ['/usr/bin/time', '-v']
                result = subprocess.run([*time_args, *cmd, str(p), str(t)], capture_output=True, text=True, check=True)
                record = json.loads(result.stdout)
                assert (record['count'], record['checksum']) == truth, (variant, truth, record)
                match = re.search(r'(\d+)\s+maximum resident set size', result.stderr) if platform.system() == 'Darwin' else re.search(r'Maximum resident set size \(kbytes\): (\d+)', result.stderr)
                record.update(variant=variant, scenario=scenario, round=round_index+1, peakRssBytes=int(match[1])*(1 if platform.system() == 'Darwin' else 1024) if match else None)
                for key in ['retainedHeapBytes', 'arrayBufferBytes', 'reportedAutomatonBytes']: record.setdefault(key, None)
                records.append(record)
    versions = {}
    for name, cmd in {'node':['node','--version'], 'rust':['rustc','--version'], 'go':['go','version'], 'java':['java','-version'], 'python':[str(CACHE/'venv/bin/python'),'--version']}.items():
        r = subprocess.run(cmd, capture_output=True, text=True); versions[name] = (r.stdout+r.stderr).strip()
    print(json.dumps(dict(pins=json.loads((CACHE/'pins.json').read_text()), pythonPackage='pyahocorasick==2.3.1', versions=versions, platform=platform.platform(), corpusSha256=hashlib.sha256(json.dumps(scenarios, sort_keys=True).encode()).hexdigest(), implementationSha256=hashlib.sha256(b''.join(f.read_bytes() for f in sorted((ROOT/'packages/modern-ahocorasick/dist').rglob('*.js')))).hexdigest(), note='ASCII, unique patterns, all overlapping occurrences; independent count and offset/ID checksum validation. Query measures iterator/callback enumeration, not array materialization. Build is cold first construction excluding process/import startup. Query is warm after 20 scans (Java 100); first result is warm and includes iterator creation/cleanup where applicable. Three independent processes each. Peak RSS is whole-process high-water, includes runtime/ICU/JIT. Heap/array buffers only where measured; null is unavailable/not applicable, not zero. reportedAutomatonBytes is library-reported storage, not retained heap. No cross-language global ranking.', records=records), indent=2))
if '--prepare' in sys.argv: prepare()
if '--run' in sys.argv: measure()
