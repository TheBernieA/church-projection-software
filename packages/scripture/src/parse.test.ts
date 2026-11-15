import { describe, expect, it } from 'vitest';
import { parseReference } from './parse';
import { compact } from './testHelpers';

/** [input, expected top candidate in compact form]. */
type Fixture = readonly [string, string];

function top(input: string, opts?: Parameters<typeof parseReference>[1]): string {
  const c = parseReference(input, opts)[0];
  return c ? compact(c.passages) : '<none>';
}

const TYPED: readonly Fixture[] = [
  ['John 3:16', 'JHN 3:16-3:16'],
  ['Jn 3.16', 'JHN 3:16-3:16'],
  ['jn3 16', 'JHN 3:16-3:16'],
  ['jn 3 16', 'JHN 3:16-3:16'],
  ['jn3:16', 'JHN 3:16-3:16'],
  ['Jn. 3:16', 'JHN 3:16-3:16'],
  ['JOHN 3:16', 'JHN 3:16-3:16'],
  ['Jhn 3:16', 'JHN 3:16-3:16'],
  ['Joh 3:16', 'JHN 3:16-3:16'],
  ['john 3:16-18', 'JHN 3:16-3:18'],
  ['John 3:16–18', 'JHN 3:16-3:18'],
  ['John 3:16—18', 'JHN 3:16-3:18'],
  ['John 3:16 - 18', 'JHN 3:16-3:18'],
  ['John 3:16-4:2', 'JHN 3:16-4:2'],
  ['1 Cor 13:4-7', '1CO 13:4-13:7'],
  ['1Cor 13:4-7', '1CO 13:4-13:7'],
  ['1 Co 13:4', '1CO 13:4-13:4'],
  ['I Cor 13:4', '1CO 13:4-13:4'],
  ['II Cor 5:17', '2CO 5:17-5:17'],
  ['2 Cor. 5:17', '2CO 5:17-5:17'],
  ['1 Corinthians 13', '1CO 13:1-13:999'],
  ['Ps 23', 'PSA 23:1-23:999'],
  ['Psa 23', 'PSA 23:1-23:999'],
  ['Psalm 23', 'PSA 23:1-23:999'],
  ['Psalms 23', 'PSA 23:1-23:999'],
  ['Pss 23', 'PSA 23:1-23:999'],
  ['Psalm 119:105', 'PSA 119:105-119:105'],
  ['Ps 119:176', 'PSA 119:176-119:176'],
  ['Ps 23-24', 'PSA 23:1-24:999'],
  ['Ps 1, 2', 'PSA 1:1-1:999, PSA 2:1-2:999'],
  ['Romans 8:28, 31-39', 'ROM 8:28-8:28, ROM 8:31-8:39'],
  ['Rom 8:28,31-39', 'ROM 8:28-8:28, ROM 8:31-8:39'],
  ['Rom 8:28; 9:1', 'ROM 8:28-8:28, ROM 9:1-9:1'],
  ['Rom 8:28; 9', 'ROM 8:28-8:28, ROM 9:1-9:999'],
  ['Rom 8:28, 29', 'ROM 8:28-8:29'],
  ['Rom 8:28, 9:1-3', 'ROM 8:28-8:28, ROM 9:1-9:3'],
  ['Gen 1:1-2:3', 'GEN 1:1-2:3'],
  ['Gen 1-2:3', 'GEN 1:1-2:3'],
  ['Gen 1-3', 'GEN 1:1-3:999'],
  ['Genesis 1:1', 'GEN 1:1-1:1'],
  ['Ge 1:1', 'GEN 1:1-1:1'],
  ['Gn 1:1', 'GEN 1:1-1:1'],
  ['Exod 20:1-17', 'EXO 20:1-20:17'],
  ['Ex 3:14', 'EXO 3:14-3:14'],
  ['Lev 19:18', 'LEV 19:18-19:18'],
  ['Num 6:24-26', 'NUM 6:24-6:26'],
  ['Deut 6:4', 'DEU 6:4-6:4'],
  ['Dt 6:4', 'DEU 6:4-6:4'],
  ['Josh 1:9', 'JOS 1:9-1:9'],
  ['Judg 6:12', 'JDG 6:12-6:12'],
  ['Ruth 1:16', 'RUT 1:16-1:16'],
  ['1 Sam 17:45', '1SA 17:45-17:45'],
  ['2 Sam 7:12', '2SA 7:12-7:12'],
  ['1 Kgs 18:21', '1KI 18:21-18:21'],
  ['2 Kings 5:14', '2KI 5:14-5:14'],
  ['1 Chr 4:10', '1CH 4:10-4:10'],
  ['2 Chron 7:14', '2CH 7:14-7:14'],
  ['Neh 8:10', 'NEH 8:10-8:10'],
  ['Esth 4:14', 'EST 4:14-4:14'],
  ['Job 19:25', 'JOB 19:25-19:25'],
  ['Prov 3:5-6', 'PRO 3:5-3:6'],
  ['Pr 3:5', 'PRO 3:5-3:5'],
  ['Eccl 3:1', 'ECC 3:1-3:1'],
  ['Qoheleth 3:1', 'ECC 3:1-3:1'],
  ['Song of Songs 2:1', 'SNG 2:1-2:1'],
  ['Song of Solomon 2:1', 'SNG 2:1-2:1'],
  ['Canticles 2:1', 'SNG 2:1-2:1'],
  ['SoS 2:1', 'SNG 2:1-2:1'],
  ['Isa 53:5', 'ISA 53:5-53:5'],
  ['Is 40:31', 'ISA 40:31-40:31'],
  ['Jer 29:11', 'JER 29:11-29:11'],
  ['Lam 3:22-23', 'LAM 3:22-3:23'],
  ['Ezek 37:1-14', 'EZK 37:1-37:14'],
  ['Dan 3:17', 'DAN 3:17-3:17'],
  ['Hos 6:6', 'HOS 6:6-6:6'],
  ['Joel 2:28', 'JOL 2:28-2:28'],
  ['Amos 5:24', 'AMO 5:24-5:24'],
  ['Jonah 2:9', 'JON 2:9-2:9'],
  ['Mic 6:8', 'MIC 6:8-6:8'],
  ['Hab 2:4', 'HAB 2:4-2:4'],
  ['Zeph 3:17', 'ZEP 3:17-3:17'],
  ['Hag 2:9', 'HAG 2:9-2:9'],
  ['Zech 4:6', 'ZEC 4:6-4:6'],
  ['Mal 3:10', 'MAL 3:10-3:10'],
  ['Matt 5', 'MAT 5:1-5:999'],
  ['Mt 6:33', 'MAT 6:33-6:33'],
  ['Mk 16:15', 'MRK 16:15-16:15'],
  ['Lk 2:11', 'LUK 2:11-2:11'],
  ['Acts 2:38', 'ACT 2:38-2:38'],
  ['Rom 8 28', 'ROM 8:28-8:28'],
  ['Gal 5:22-23', 'GAL 5:22-5:23'],
  ['Eph 2:8-9', 'EPH 2:8-2:9'],
  ['Phil 4 13', 'PHP 4:13-4:13'],
  ['Php 4:13', 'PHP 4:13-4:13'],
  ['Col 3:23', 'COL 3:23-3:23'],
  ['1 Thess 5:16-18', '1TH 5:16-5:18'],
  ['2 Tim 3:16', '2TI 3:16-3:16'],
  ['Titus 2:11', 'TIT 2:11-2:11'],
  ['Heb 11:1', 'HEB 11:1-11:1'],
  ['Jas 1:5', 'JAS 1:5-1:5'],
  ['1 Pet 5:7', '1PE 5:7-5:7'],
  ['2 Pet 3:9', '2PE 3:9-3:9'],
  ['1 John 1:9', '1JN 1:9-1:9'],
  ['1 Jn 4:8', '1JN 4:8-4:8'],
  ['1John 4:8', '1JN 4:8-4:8'],
  ['Rev 21:4', 'REV 21:4-21:4'],
  ['Revelations 3:20', 'REV 3:20-3:20'],
  ['Revelation 22', 'REV 22:1-22:999'],
  ['jn 3', 'JHN 3:1-3:999'],
  ['rom 8 28', 'ROM 8:28-8:28'],
  ['John 3:16.', 'JHN 3:16-3:16'],
  ['John 3v16', 'JHN 3:16-3:16'],
  ['John 3 vs 16', 'JHN 3:16-3:16'],
];

const SINGLE_CHAPTER: readonly Fixture[] = [
  ['Jude 3', 'JUD 1:3-1:3'],
  ['Jude 1:3', 'JUD 1:3-1:3'],
  ['Jude 1 3', 'JUD 1:3-1:3'],
  ['Jude 24-25', 'JUD 1:24-1:25'],
  ['Jude', 'JUD 1:1-1:999'],
  ['Obadiah 4', 'OBA 1:4-1:4'],
  ['Obad 1:4', 'OBA 1:4-1:4'],
  ['Phm 6', 'PHM 1:6-1:6'],
  ['Philemon 6', 'PHM 1:6-1:6'],
  ['2 John 6', '2JN 1:6-1:6'],
  ['3 John 2', '3JN 1:2-1:2'],
  ['Jude verse 3', 'JUD 1:3-1:3'],
  ['Jude chapter 1', 'JUD 1:1-1:999'],
];

const SPOKEN: readonly Fixture[] = [
  ['1st Corinthians 13 4 to 7', '1CO 13:4-13:7'],
  ['First Corinthians chapter thirteen verses four through seven', '1CO 13:4-13:7'],
  ['first corinthians thirteen', '1CO 13:1-13:999'],
  ['second kings five fourteen', '2KI 5:14-5:14'],
  ['Second Kings chapter 5', '2KI 5:1-5:999'],
  ['third john verse four', '3JN 1:4-1:4'],
  ['first john one nine', '1JN 1:9-1:9'],
  ['one john one nine', '1JN 1:9-1:9'],
  ['John three sixteen', 'JHN 3:16-3:16'],
  ['john chapter three verse sixteen', 'JHN 3:16-3:16'],
  ['John chapter 3 and verse 16', 'JHN 3:16-3:16'],
  ['John chapter 3, verse 16', 'JHN 3:16-3:16'],
  ['John three colon sixteen', 'JHN 3:16-3:16'],
  ['Psalm twenty-three', 'PSA 23:1-23:999'],
  ['Psalm twenty three', 'PSA 23:1-23:999'],
  ['Psalm one hundred and nineteen verse one hundred and five', 'PSA 119:105-119:105'],
  ['Psalm one hundred nineteen', 'PSA 119:1-119:999'],
  ['Psalm a hundred', 'PSA 100:1-100:999'],
  ['Psalm one hundred and fifty', 'PSA 150:1-150:999'],
  ['Romans eight twenty-eight', 'ROM 8:28-8:28'],
  ['Romans chapter eight verses twenty eight to thirty', 'ROM 8:28-8:30'],
  ['Romans 8 verse 28 and 29', 'ROM 8:28-8:29'],
  ['Romans 8 verses 28 and 31', 'ROM 8:28-8:28, ROM 8:31-8:31'],
  ['Genesis chapter 1 verse 1 to chapter 2 verse 3', 'GEN 1:1-2:3'],
  ['Genesis one one through two three', 'GEN 1:1-2:3'],
  ['the gospel of john chapter 3', 'JHN 3:1-3:999'],
  ['the gospel according to Saint John 3:16', 'JHN 3:16-3:16'],
  ['book of romans 12', 'ROM 12:1-12:999'],
  ['the book of Acts chapter 2', 'ACT 2:1-2:999'],
  ['the first epistle of john 4 8', '1JN 4:8-4:8'],
  ['first book of kings 18', '1KI 18:1-18:999'],
  ['the letter to the Hebrews 11 1', 'HEB 11:1-11:1'],
  ['Matthew thirteen', 'MAT 13:1-13:999'],
  ['Luke fifteen eleven to thirty-two', 'LUK 15:11-15:32'],
  ['Isaiah fifty-three five', 'ISA 53:5-53:5'],
  ['Mark sixteen fifteen', 'MRK 16:15-16:15'],
  ['Acts of the Apostles 2:1', 'ACT 2:1-2:1'],
  ['Song of Songs chapter two', 'SNG 2:1-2:999'],
  ['John 3:16 till 18', 'JHN 3:16-3:18'],
  ['John 3:16 until 18', 'JHN 3:16-3:18'],
  ['John 3:16 thru 18', 'JHN 3:16-3:18'],
];

const INVALID: readonly Fixture[] = [
  ['', '<none>'],
  ['   ', '<none>'],
  ['hello world', '<none>'],
  ['3:16', '<none>'],
  ['I have two children', '<none>'],
  ['John 22', '<none>'],
  ['John 22:1', '<none>'],
  ['Ps 151', '<none>'],
  ['Jude 2:1', '<none>'],
  ['Genesis 51', '<none>'],
  ['John 3:0', '<none>'],
  ['John 0:1', '<none>'],
  ['John 3:177', '<none>'],
  ['John 3:18-16', '<none>'],
  ['Obadiah 2:1', '<none>'],
  ['Rev 23', '<none>'],
  ['x 3:16', '<none>'],
  ['verse 18', '<none>'],
];

describe('parseReference — typed forms', () => {
  it.each(TYPED)('%s → %s', (input, expected) => {
    expect(top(input)).toBe(expected);
  });
});

describe('parseReference — single-chapter books', () => {
  it.each(SINGLE_CHAPTER)('%s → %s', (input, expected) => {
    expect(top(input)).toBe(expected);
  });
});

describe('parseReference — spoken forms', () => {
  it.each(SPOKEN)('%s → %s', (input, expected) => {
    expect(top(input)).toBe(expected);
  });
});

describe('parseReference — invalid input', () => {
  it.each(INVALID)('%j → %s', (input, expected) => {
    expect(top(input)).toBe(expected);
  });
});
