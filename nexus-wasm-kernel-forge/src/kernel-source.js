// SPDX-License-Identifier: MIT

export const CELLULAR_WORLD_WAT = String.raw`(module
  (memory (export "memory") 16 32)

  (func $wrap (param $value i32) (param $maximum i32) (result i32)
    (i32.rem_u
      (i32.add (local.get $value) (local.get $maximum))
      (local.get $maximum)))

  (func $at
    (param $pointer i32)
    (param $x i32)
    (param $y i32)
    (param $width i32)
    (param $height i32)
    (result i32)
    (i32.load8_u
      (i32.add
        (local.get $pointer)
        (i32.add
          (i32.mul
            (call $wrap (local.get $y) (local.get $height))
            (local.get $width))
          (call $wrap (local.get $x) (local.get $width))))))

  (func $neighbors
    (param $pointer i32)
    (param $x i32)
    (param $y i32)
    (param $width i32)
    (param $height i32)
    (result i32)
    (local $count i32)

    (local.set $count
      (call $at
        (local.get $pointer)
        (i32.sub (local.get $x) (i32.const 1))
        (i32.sub (local.get $y) (i32.const 1))
        (local.get $width)
        (local.get $height)))
    (local.set $count
      (i32.add (local.get $count)
        (call $at
          (local.get $pointer)
          (local.get $x)
          (i32.sub (local.get $y) (i32.const 1))
          (local.get $width)
          (local.get $height))))
    (local.set $count
      (i32.add (local.get $count)
        (call $at
          (local.get $pointer)
          (i32.add (local.get $x) (i32.const 1))
          (i32.sub (local.get $y) (i32.const 1))
          (local.get $width)
          (local.get $height))))
    (local.set $count
      (i32.add (local.get $count)
        (call $at
          (local.get $pointer)
          (i32.sub (local.get $x) (i32.const 1))
          (local.get $y)
          (local.get $width)
          (local.get $height))))
    (local.set $count
      (i32.add (local.get $count)
        (call $at
          (local.get $pointer)
          (i32.add (local.get $x) (i32.const 1))
          (local.get $y)
          (local.get $width)
          (local.get $height))))
    (local.set $count
      (i32.add (local.get $count)
        (call $at
          (local.get $pointer)
          (i32.sub (local.get $x) (i32.const 1))
          (i32.add (local.get $y) (i32.const 1))
          (local.get $width)
          (local.get $height))))
    (local.set $count
      (i32.add (local.get $count)
        (call $at
          (local.get $pointer)
          (local.get $x)
          (i32.add (local.get $y) (i32.const 1))
          (local.get $width)
          (local.get $height))))
    (local.set $count
      (i32.add (local.get $count)
        (call $at
          (local.get $pointer)
          (i32.add (local.get $x) (i32.const 1))
          (i32.add (local.get $y) (i32.const 1))
          (local.get $width)
          (local.get $height))))

    (local.get $count))

  (func (export "step")
    (param $source i32)
    (param $destination i32)
    (param $width i32)
    (param $height i32)
    (param $birthMask i32)
    (param $survivalMask i32)
    (result i32)
    (local $x i32)
    (local $y i32)
    (local $index i32)
    (local $neighborCount i32)
    (local $alive i32)
    (local $ruleMask i32)
    (local $next i32)
    (local $living i32)

    (local.set $y (i32.const 0))
    (local.set $living (i32.const 0))

    (block $rowsDone
      (loop $rows
        (br_if $rowsDone
          (i32.ge_u (local.get $y) (local.get $height)))
        (local.set $x (i32.const 0))

        (block $columnsDone
          (loop $columns
            (br_if $columnsDone
              (i32.ge_u (local.get $x) (local.get $width)))

            (local.set $index
              (i32.add
                (i32.mul (local.get $y) (local.get $width))
                (local.get $x)))
            (local.set $neighborCount
              (call $neighbors
                (local.get $source)
                (local.get $x)
                (local.get $y)
                (local.get $width)
                (local.get $height)))
            (local.set $alive
              (i32.load8_u
                (i32.add (local.get $source) (local.get $index))))
            (local.set $ruleMask
              (if (result i32)
                (i32.eqz (local.get $alive))
                (then (local.get $birthMask))
                (else (local.get $survivalMask))))
            (local.set $next
              (i32.and
                (i32.shr_u
                  (local.get $ruleMask)
                  (local.get $neighborCount))
                (i32.const 1)))
            (i32.store8
              (i32.add (local.get $destination) (local.get $index))
              (local.get $next))
            (local.set $living
              (i32.add (local.get $living) (local.get $next)))

            (local.set $x (i32.add (local.get $x) (i32.const 1)))
            (br $columns)))

        (local.set $y (i32.add (local.get $y) (i32.const 1)))
        (br $rows)))

    (local.get $living))

  (func (export "checksum")
    (param $pointer i32)
    (param $length i32)
    (result i32)
    (local $index i32)
    (local $hash i32)

    (local.set $hash (i32.const -2128831035))
    (local.set $index (i32.const 0))

    (block $done
      (loop $loop
        (br_if $done
          (i32.ge_u (local.get $index) (local.get $length)))
        (local.set $hash
          (i32.mul
            (i32.xor
              (local.get $hash)
              (i32.load8_u
                (i32.add (local.get $pointer) (local.get $index))))
            (i32.const 16777619)))
        (local.set $index
          (i32.add (local.get $index) (i32.const 1)))
        (br $loop)))

    (local.get $hash)))`;

export const RULES = Object.freeze([
  { id: 'conway', name: 'Conway Life', code: 'B3/S23', birth: 8, survive: 12, description: 'Classic emergent organisms.' },
  { id: 'highlife', name: 'HighLife', code: 'B36/S23', birth: 72, survive: 12, description: 'Adds self-replicating structures.' },
  { id: 'seeds', name: 'Seeds', code: 'B2/S', birth: 4, survive: 0, description: 'Explosive two-neighbor growth.' },
  { id: 'daynight', name: 'Day & Night', code: 'B3678/S34678', birth: 456, survive: 472, description: 'Symmetric living and dead domains.' },
  { id: 'maze', name: 'Maze', code: 'B3/S12345', birth: 8, survive: 62, description: 'Builds persistent labyrinths.' },
  { id: 'anneal', name: 'Anneal', code: 'B4678/S35678', birth: 464, survive: 488, description: 'Condenses noisy fields into islands.' },
]);

export function ruleCode(birth, survive) {
  const digits = mask => Array.from({ length: 9 }, (_, value) => value)
    .filter(value => (mask & (1 << value)) !== 0)
    .join('');
  return `B${digits(birth)}/S${digits(survive)}`;
}
