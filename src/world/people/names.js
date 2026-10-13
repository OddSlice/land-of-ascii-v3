// People's names (phase 4a): plain country names and bynames, chosen from the
// seed. Data only.
export const GIVEN = [
  'Ada', 'Agnes', 'Alda', 'Alys', 'Amice', 'Anne', 'Beatrix', 'Bess', 'Cecily', 'Clare', 'Edith', 'Elin',
  'Ellen', 'Emma', 'Ida', 'Isolde', 'Joan', 'Juliana', 'Kate', 'Lettice', 'Mabel', 'Margery', 'Marion', 'Maud',
  'Meg', 'Nell', 'Rose', 'Sabine', 'Tamsin', 'Wenna', 'Wynn', 'Hild',
  'Adam', 'Aldo', 'Alan', 'Ambrose', 'Bennet', 'Bram', 'Cuthbert', 'Dunstan', 'Edmund', 'Edric', 'Gale', 'Gareth',
  'Gilbert', 'Godric', 'Hal', 'Hamon', 'Hugh', 'Jack', 'Jocelin', 'Kit', 'Lambert', 'Martin', 'Miles', 'Nicol',
  'Osric', 'Piers', 'Ralf', 'Roger', 'Simon', 'Tobin', 'Wat', 'Walter',
];

export const BYNAME = [
  'Ash', 'Brook', 'Barrow', 'Cobb', 'Dale', 'Fenn', 'Field', 'Ford', 'Glade', 'Hale', 'Hay', 'Heath',
  'Holt', 'Lane', 'Lea', 'Marsh', 'Mill', 'Moor', 'Nash', 'Pike', 'Rowe', 'Rush', 'Shaw', 'Stone',
  'Thorn', 'Wells', 'Wood', 'Wren', 'Croft', 'Combe', 'Hollow', 'Reed',
];

// The roles, as they are named on screen (`label`), and which village each
// suits (`needs`: what the village must have).
export const ROLES = {
  farmer: { label: 'farmer' },
  fisher: { label: 'fisher', needs: 'water' },
  carter: { label: 'carter' },
  shepherd: { label: 'shepherd' },
  keeper: { label: 'keeper of the chapel' },
  minder: { label: 'minds the green', needs: 'green' },
  wellkeeper: { label: 'keeps the well' },
  householder: { label: 'keeps house' },
  guard: { label: 'guard at the fort' },
  traveller: { label: 'traveller' },
};
