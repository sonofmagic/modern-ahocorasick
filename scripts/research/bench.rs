use std::{env, fs, hint::black_box, time::Instant};
fn main() {
    let args: Vec<String> = env::args().collect();
    let patterns: Vec<String> = fs::read_to_string(&args[2])
        .unwrap()
        .lines()
        .map(str::to_owned)
        .collect();
    let text = fs::read_to_string(&args[3]).unwrap();
    let before = Instant::now();
    if args[1] == "rust" {
        let ac = aho_corasick::AhoCorasick::new(&patterns).unwrap();
        let build = before.elapsed().as_secs_f64() * 1000.0;
        let scan = || {
            ac.find_overlapping_iter(&text)
                .fold((0u64, 0u64), |(n, s), m| {
                    (
                        n + 1,
                        s + m.start() as u64 + m.end() as u64 + m.pattern().as_usize() as u64,
                    )
                })
        };
        for _ in 0..20 {
            black_box(scan());
            black_box(ac.find_overlapping_iter(&text).next());
        }
        let t = Instant::now();
        let result = scan();
        let query = t.elapsed().as_secs_f64() * 1000.0;
        let t = Instant::now();
        black_box(ac.find_overlapping_iter(&text).next());
        let first = t.elapsed().as_secs_f64() * 1000.0;
        println!("{{\"buildMs\":{},\"queryMs\":{},\"firstMs\":{},\"count\":{},\"checksum\":{},\"reportedAutomatonBytes\":{}}}",build,query,first,result.0,result.1,ac.memory_usage());
    } else {
        let ac = daachorse::DoubleArrayAhoCorasick::<u32>::new(&patterns).unwrap();
        let build = before.elapsed().as_secs_f64() * 1000.0;
        let scan = || {
            ac.find_overlapping_iter(&text)
                .fold((0u64, 0u64), |(n, s), m| {
                    (
                        n + 1,
                        s + m.start() as u64 + m.end() as u64 + m.value() as u64,
                    )
                })
        };
        for _ in 0..20 {
            black_box(scan());
            black_box(ac.find_overlapping_iter(&text).next());
        }
        let t = Instant::now();
        let result = scan();
        let query = t.elapsed().as_secs_f64() * 1000.0;
        let t = Instant::now();
        black_box(ac.find_overlapping_iter(&text).next());
        let first = t.elapsed().as_secs_f64() * 1000.0;
        println!(
            "{{\"buildMs\":{},\"queryMs\":{},\"firstMs\":{},\"count\":{},\"checksum\":{}}}",
            build, query, first, result.0, result.1
        );
    }
}
