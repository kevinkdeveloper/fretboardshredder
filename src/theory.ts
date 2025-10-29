
export const NOTE_NAMES_SHARP = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
export const NOTE_NAMES_FLAT  = ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];
export const SCALES: Record<string, number[]> = {
  "Major (Ionian)":           [0,2,4,5,7,9,11],
  "Natural Minor (Aeolian)":  [0,2,3,5,7,8,10],
  "Harmonic Minor":           [0,2,3,5,7,8,11],
  "Melodic Minor (Asc)":      [0,2,3,5,7,9,11],
  "Pentatonic Major":         [0,2,4,7,9],
  "Pentatonic Minor":         [0,3,5,7,10],
  "Blues Minor (Hexatonic)":  [0,3,5,6,7,10],
  "Dorian":                   [0,2,3,5,7,9,10],
  "Phrygian":                 [0,1,3,5,7,8,10],
  "Lydian":                   [0,2,4,6,7,9,11],
  "Mixolydian":               [0,2,4,5,7,9,10],
  "Locrian":                  [0,1,3,5,6,8,10],
};
export const TUNINGS_ABS: Record<string, number[]> = {
  "Standard (EADGBE)": [40,45,50,55,59,64],
  "Drop D (DADGBE)":   [38,45,50,55,59,64],
  "DADGAD":            [38,45,50,55,57,62],
  "Eb Standard":       [39,44,49,54,58,63]
};
export const FRET_MARKERS = new Set([3,5,7,9,12,15,17,19,21,24]);
export const midiToClass = (m:number)=> m % 12;
