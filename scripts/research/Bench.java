import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.ahocorasick.trie.Trie;
public class Bench {
  static long[] scan(Trie trie, String text, Map<String,Integer> ids) {
    long[] result={0,0};
    trie.parseText(text, emit -> {result[0]++; result[1]+=emit.getStart()+emit.getEnd()+1+ids.get(emit.getKeyword());return true;});
    return result;
  }
  public static void main(String[] args) throws Exception {
    List<String> patterns=Files.readAllLines(Paths.get(args[0]),StandardCharsets.UTF_8);
    String text=new String(Files.readAllBytes(Paths.get(args[1])),StandardCharsets.UTF_8);
    Map<String,Integer> ids=new HashMap<>();for(int i=0;i<patterns.size();i++)ids.put(patterns.get(i),i);
    long t=System.nanoTime();Trie trie=Trie.builder().addKeywords(patterns).build();double build=(System.nanoTime()-t)/1e6;
    for(int i=0;i<100;i++){scan(trie,text,ids);trie.firstMatch(text);}
    t=System.nanoTime();long[] result=scan(trie,text,ids);double query=(System.nanoTime()-t)/1e6;
    t=System.nanoTime();trie.firstMatch(text);double first=(System.nanoTime()-t)/1e6;
    System.out.println("{\"buildMs\":"+build+",\"queryMs\":"+query+",\"firstMs\":"+first+",\"count\":"+result[0]+",\"checksum\":"+result[1]+"}");
  }
}
