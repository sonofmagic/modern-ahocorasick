import json, sys, time
import ahocorasick
patterns = open(sys.argv[1]).read().splitlines()
text = open(sys.argv[2]).read()
t = time.perf_counter_ns()
ac = ahocorasick.Automaton()
for i, p in enumerate(patterns): ac.add_word(p, (i, len(p)))
ac.make_automaton()
build = (time.perf_counter_ns() - t) / 1e6
def scan():
    count = checksum = 0
    for end, (i, length) in ac.iter(text):
        count += 1
        checksum += end - length + 1 + end + 1 + i
    return count, checksum
for _ in range(20):
    scan()
    next(ac.iter(text), None)
t = time.perf_counter_ns(); count, checksum = scan(); query = (time.perf_counter_ns() - t) / 1e6
t = time.perf_counter_ns(); next(ac.iter(text), None); first = (time.perf_counter_ns() - t) / 1e6
print(json.dumps(dict(buildMs=build, queryMs=query, firstMs=first, count=count, checksum=checksum, reportedAutomatonBytes=ac.get_stats()['total_size'])))
