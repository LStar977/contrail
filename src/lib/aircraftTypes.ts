// ICAO type designators → friendly names and the glyph family used on the map.
export type Glyph = 'heavy4' | 'heavy' | 'jet' | 'regional' | 'turboprop' | 'light' | 'heli';

const NAMES: Record<string, string> = {
  A318: 'Airbus A318', A319: 'Airbus A319', A320: 'Airbus A320', A321: 'Airbus A321', A19N: 'Airbus A319neo', A20N: 'Airbus A320neo',
  A21N: 'Airbus A321neo', A332: 'Airbus A330-200', A333: 'Airbus A330-300', A338: 'Airbus A330-800', A339: 'Airbus A330-900',
  A342: 'Airbus A340-200', A343: 'Airbus A340-300', A345: 'Airbus A340-500', A346: 'Airbus A340-600', A359: 'Airbus A350-900',
  A35K: 'Airbus A350-1000', A388: 'Airbus A380-800', A306: 'Airbus A300-600', A310: 'Airbus A310', BCS1: 'Airbus A220-100',
  BCS3: 'Airbus A220-300', A400: 'Airbus A400M', A124: 'Antonov An-124', A225: 'Antonov An-225',
  B712: 'Boeing 717', B732: 'Boeing 737-200', B733: 'Boeing 737-300', B734: 'Boeing 737-400', B735: 'Boeing 737-500',
  B736: 'Boeing 737-600', B737: 'Boeing 737-700', B738: 'Boeing 737-800', B739: 'Boeing 737-900', B37M: 'Boeing 737 MAX 7',
  B38M: 'Boeing 737 MAX 8', B39M: 'Boeing 737 MAX 9', B3XM: 'Boeing 737 MAX 10', B744: 'Boeing 747-400', B748: 'Boeing 747-8',
  B74F: 'Boeing 747 Freighter', B752: 'Boeing 757-200', B753: 'Boeing 757-300', B762: 'Boeing 767-200', B763: 'Boeing 767-300',
  B764: 'Boeing 767-400', B772: 'Boeing 777-200', B77L: 'Boeing 777-200LR', B77W: 'Boeing 777-300ER', B773: 'Boeing 777-300',
  B778: 'Boeing 777-8', B779: 'Boeing 777-9', B788: 'Boeing 787-8', B789: 'Boeing 787-9', B78X: 'Boeing 787-10',
  E170: 'Embraer E170', E175: 'Embraer E175', E190: 'Embraer E190', E195: 'Embraer E195', E290: 'Embraer E190-E2',
  E295: 'Embraer E195-E2', E75L: 'Embraer E175', E75S: 'Embraer E175', E135: 'Embraer ERJ-135', E145: 'Embraer ERJ-145',
  CRJ2: 'Bombardier CRJ200', CRJ7: 'Bombardier CRJ700', CRJ9: 'Bombardier CRJ900', CRJX: 'Bombardier CRJ1000',
  AT43: 'ATR 42-300', AT45: 'ATR 42-500', AT46: 'ATR 42-600', AT72: 'ATR 72', AT75: 'ATR 72-500', AT76: 'ATR 72-600',
  DH8A: 'Dash 8-100', DH8B: 'Dash 8-200', DH8C: 'Dash 8-300', DH8D: 'Dash 8-400', SF34: 'Saab 340', SB20: 'Saab 2000',
  MD11: 'McDonnell Douglas MD-11', MD82: 'McDonnell Douglas MD-82', MD83: 'McDonnell Douglas MD-83', MD88: 'McDonnell Douglas MD-88',
  DC10: 'McDonnell Douglas DC-10', C130: 'Lockheed C-130 Hercules', C30J: 'Lockheed C-130J', C17: 'Boeing C-17 Globemaster',
  K35R: 'Boeing KC-135', B52: 'Boeing B-52', C5M: 'Lockheed C-5M Galaxy', P8: 'Boeing P-8 Poseidon', E3TF: 'Boeing E-3 Sentry',
  A3ST: 'Airbus BelugaST', A337: 'Airbus BelugaXL', GLF4: 'Gulfstream IV', GLF5: 'Gulfstream V', GLF6: 'Gulfstream G650',
  GA6C: 'Gulfstream G600', GA7C: 'Gulfstream G700', GLEX: 'Bombardier Global Express', GL5T: 'Bombardier Global 5000',
  GL7T: 'Bombardier Global 7500', CL30: 'Bombardier Challenger 300', CL35: 'Bombardier Challenger 350', CL60: 'Bombardier Challenger 600',
  F900: 'Dassault Falcon 900', F2TH: 'Dassault Falcon 2000', FA7X: 'Dassault Falcon 7X', FA8X: 'Dassault Falcon 8X',
  C25A: 'Cessna Citation CJ2', C25B: 'Cessna Citation CJ3', C25C: 'Cessna Citation CJ4', C510: 'Cessna Citation Mustang',
  C525: 'Cessna CitationJet', C560: 'Cessna Citation V', C56X: 'Cessna Citation Excel', C680: 'Cessna Citation Sovereign',
  C68A: 'Cessna Citation Latitude', C700: 'Cessna Citation Longitude', C750: 'Cessna Citation X', E55P: 'Embraer Phenom 300',
  E50P: 'Embraer Phenom 100', LJ45: 'Learjet 45', LJ60: 'Learjet 60', PC12: 'Pilatus PC-12', PC24: 'Pilatus PC-24',
  B350: 'Beechcraft King Air 350', BE20: 'Beechcraft King Air 200', BE9L: 'Beechcraft King Air 90', TBM9: 'Daher TBM 900',
  TBM7: 'Daher TBM 700', C208: 'Cessna 208 Caravan', C172: 'Cessna 172', C182: 'Cessna 182', C152: 'Cessna 152',
  C206: 'Cessna 206', C210: 'Cessna 210', P28A: 'Piper PA-28', PA46: 'Piper Malibu', SR22: 'Cirrus SR22', SR20: 'Cirrus SR20',
  DA40: 'Diamond DA40', DA42: 'Diamond DA42', BE36: 'Beechcraft Bonanza', M20P: 'Mooney M20',
  EC35: 'Airbus H135', EC45: 'Airbus H145', EC30: 'Airbus H130', AS50: 'Airbus H125', AS65: 'Airbus Dauphin',
  B06: 'Bell 206', B407: 'Bell 407', B429: 'Bell 429', S76: 'Sikorsky S-76', S92: 'Sikorsky S-92', R44: 'Robinson R44',
  R22: 'Robinson R22', R66: 'Robinson R66', A139: 'Leonardo AW139', A169: 'Leonardo AW169', H60: 'Sikorsky Black Hawk',
  CONC: 'Concorde', IL76: 'Ilyushin Il-76', SU95: 'Sukhoi Superjet 100', C919: 'COMAC C919', AJ27: 'COMAC ARJ21',
};

const HEAVY4 = new Set(['A388', 'B744', 'B748', 'B74F', 'A342', 'A343', 'A345', 'A346', 'A124', 'A225', 'IL76', 'C5M', 'B52', 'K35R', 'E3TF', 'C17']);
const HEAVY = /^(A30|A31|A33|A35|B76|B77|B78|MD11|DC10|A3ST|A337|K)/;
const REGIONAL = /^(E1|E7|E2|CRJ|BCS|AJ27|SU95|GL|CL|F9|F2|FA|C25|C5|C6|C7|E5|LJ|PC24|GA)/;
const TURBOPROP = /^(AT[4-7]|DH8|SF34|SB20|C130|C30J|B350|BE20|BE9L|PC12|C208|TBM|A400)/;
const HELI = /^(EC|AS|B06|B4|S76|S92|R22|R44|R66|A1[0-9]|H60|H1|H47|MI)/;

export function typeName(code: string, desc?: string): string {
  if (NAMES[code]) return NAMES[code];
  if (desc) {
    // "BOEING 787-9 Dreamliner" → "Boeing 787-9 Dreamliner"
    return desc.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\b(Ii|Iii|Iv)\b/g, (s) => s.toUpperCase());
  }
  return code || 'Unknown type';
}

export function glyphFor(type: string, cat: string): Glyph {
  if (cat === 'A7' || HELI.test(type)) return 'heli';
  if (HEAVY4.has(type)) return 'heavy4';
  if (cat === 'A5' || HEAVY.test(type)) return 'heavy';
  if (TURBOPROP.test(type)) return 'turboprop';
  if (cat === 'A1' || cat === 'B1' || cat === 'B4') return 'light';
  if (cat === 'A2' || REGIONAL.test(type)) return 'regional';
  if (/^(C1[5-9]|C2[01]|P28|PA|SR2|DA|BE3|M20)/.test(type)) return 'light';
  return 'jet';
}

export function familyWord(g: Glyph): string {
  return { heavy4: 'Widebody, four engines', heavy: 'Widebody', jet: 'Narrowbody', regional: 'Regional or business jet', turboprop: 'Turboprop', light: 'Light aircraft', heli: 'Helicopter' }[g];
}
