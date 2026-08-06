// SPDX-License-Identifier: Apache-2.0
// Paper-backed Generation One kernel: semi-Lagrangian advection, pressure projection,
// vorticity confinement, dye transport, splats, decay, and memory utilities.

export const FLUID_WAT = String.raw`(module
  (memory (export "memory") 64 256)

  (func $idx (param $x i32) (param $y i32) (param $width i32) (result i32)
    (i32.add (i32.mul (local.get $y) (local.get $width)) (local.get $x)))

  (func $clampi (param $value i32) (param $maximum i32) (result i32)
    (if (result i32)
      (i32.lt_s (local.get $value) (i32.const 0))
      (then (i32.const 0))
      (else
        (if (result i32)
          (i32.ge_s (local.get $value) (local.get $maximum))
          (then (i32.sub (local.get $maximum) (i32.const 1)))
          (else (local.get $value))))))

  (func $clampf (param $value f32) (param $low f32) (param $high f32) (result f32)
    (if (result f32)
      (f32.lt (local.get $value) (local.get $low))
      (then (local.get $low))
      (else
        (if (result f32)
          (f32.gt (local.get $value) (local.get $high))
          (then (local.get $high))
          (else (local.get $value))))))

  (func $load (param $base i32) (param $index i32) (result f32)
    (f32.load
      (i32.add
        (local.get $base)
        (i32.shl (local.get $index) (i32.const 2)))))

  (func $store (param $base i32) (param $index i32) (param $value f32)
    (f32.store
      (i32.add
        (local.get $base)
        (i32.shl (local.get $index) (i32.const 2)))
      (local.get $value)))

  (func $sample
    (param $base i32)
    (param $x i32)
    (param $y i32)
    (param $width i32)
    (param $height i32)
    (result f32)
    (call $load
      (local.get $base)
      (call $idx
        (call $clampi (local.get $x) (local.get $width))
        (call $clampi (local.get $y) (local.get $height))
        (local.get $width))))

  (func (export "clear") (param $base i32) (param $length i32)
    (local $index i32)
    (local.set $index (i32.const 0))
    (block $done
      (loop $loop
        (br_if $done (i32.ge_u (local.get $index) (local.get $length)))
        (call $store (local.get $base) (local.get $index) (f32.const 0))
        (local.set $index (i32.add (local.get $index) (i32.const 1)))
        (br $loop))))

  (func (export "copy") (param $destination i32) (param $source i32) (param $length i32)
    (local $index i32)
    (local.set $index (i32.const 0))
    (block $done
      (loop $loop
        (br_if $done (i32.ge_u (local.get $index) (local.get $length)))
        (call $store
          (local.get $destination)
          (local.get $index)
          (call $load (local.get $source) (local.get $index)))
        (local.set $index (i32.add (local.get $index) (i32.const 1)))
        (br $loop))))

  (func (export "scale") (param $base i32) (param $length i32) (param $factor f32)
    (local $index i32)
    (local.set $index (i32.const 0))
    (block $done
      (loop $loop
        (br_if $done (i32.ge_u (local.get $index) (local.get $length)))
        (call $store
          (local.get $base)
          (local.get $index)
          (f32.mul
            (call $load (local.get $base) (local.get $index))
            (local.get $factor)))
        (local.set $index (i32.add (local.get $index) (i32.const 1)))
        (br $loop))))

  (func (export "advect")
    (param $destination i32)
    (param $source i32)
    (param $velocityX i32)
    (param $velocityY i32)
    (param $width i32)
    (param $height i32)
    (param $timeStep f32)
    (local $x i32)
    (local $y i32)
    (local $index i32)
    (local $x0 i32)
    (local $x1 i32)
    (local $y0 i32)
    (local $y1 i32)
    (local $px f32)
    (local $py f32)
    (local $sx f32)
    (local $sy f32)
    (local $v00 f32)
    (local $v10 f32)
    (local $v01 f32)
    (local $v11 f32)
    (local $top f32)
    (local $bottom f32)

    (local.set $y (i32.const 0))
    (block $rowsDone
      (loop $rows
        (br_if $rowsDone (i32.ge_u (local.get $y) (local.get $height)))
        (local.set $x (i32.const 0))
        (block $columnsDone
          (loop $columns
            (br_if $columnsDone (i32.ge_u (local.get $x) (local.get $width)))
            (local.set $index (call $idx (local.get $x) (local.get $y) (local.get $width)))
            (local.set $px
              (call $clampf
                (f32.sub
                  (f32.convert_i32_s (local.get $x))
                  (f32.mul
                    (local.get $timeStep)
                    (call $load (local.get $velocityX) (local.get $index))))
                (f32.const 0)
                (f32.sub (f32.convert_i32_s (local.get $width)) (f32.const 1.001))))
            (local.set $py
              (call $clampf
                (f32.sub
                  (f32.convert_i32_s (local.get $y))
                  (f32.mul
                    (local.get $timeStep)
                    (call $load (local.get $velocityY) (local.get $index))))
                (f32.const 0)
                (f32.sub (f32.convert_i32_s (local.get $height)) (f32.const 1.001))))
            (local.set $x0 (i32.trunc_f32_s (f32.floor (local.get $px))))
            (local.set $y0 (i32.trunc_f32_s (f32.floor (local.get $py))))
            (local.set $x1 (i32.add (local.get $x0) (i32.const 1)))
            (local.set $y1 (i32.add (local.get $y0) (i32.const 1)))
            (local.set $sx (f32.sub (local.get $px) (f32.convert_i32_s (local.get $x0))))
            (local.set $sy (f32.sub (local.get $py) (f32.convert_i32_s (local.get $y0))))
            (local.set $v00 (call $sample (local.get $source) (local.get $x0) (local.get $y0) (local.get $width) (local.get $height)))
            (local.set $v10 (call $sample (local.get $source) (local.get $x1) (local.get $y0) (local.get $width) (local.get $height)))
            (local.set $v01 (call $sample (local.get $source) (local.get $x0) (local.get $y1) (local.get $width) (local.get $height)))
            (local.set $v11 (call $sample (local.get $source) (local.get $x1) (local.get $y1) (local.get $width) (local.get $height)))
            (local.set $top
              (f32.add
                (f32.mul (local.get $v00) (f32.sub (f32.const 1) (local.get $sx)))
                (f32.mul (local.get $v10) (local.get $sx))))
            (local.set $bottom
              (f32.add
                (f32.mul (local.get $v01) (f32.sub (f32.const 1) (local.get $sx)))
                (f32.mul (local.get $v11) (local.get $sx))))
            (call $store
              (local.get $destination)
              (local.get $index)
              (f32.add
                (f32.mul (local.get $top) (f32.sub (f32.const 1) (local.get $sy)))
                (f32.mul (local.get $bottom) (local.get $sy))))
            (local.set $x (i32.add (local.get $x) (i32.const 1)))
            (br $columns)))
        (local.set $y (i32.add (local.get $y) (i32.const 1)))
        (br $rows))))

  (func (export "divergence")
    (param $destination i32)
    (param $velocityX i32)
    (param $velocityY i32)
    (param $width i32)
    (param $height i32)
    (local $x i32)
    (local $y i32)
    (local $index i32)
    (local $value f32)
    (local.set $y (i32.const 0))
    (block $rowsDone
      (loop $rows
        (br_if $rowsDone (i32.ge_u (local.get $y) (local.get $height)))
        (local.set $x (i32.const 0))
        (block $columnsDone
          (loop $columns
            (br_if $columnsDone (i32.ge_u (local.get $x) (local.get $width)))
            (local.set $index (call $idx (local.get $x) (local.get $y) (local.get $width)))
            (local.set $value
              (f32.mul
                (f32.const -0.5)
                (f32.add
                  (f32.sub
                    (call $sample (local.get $velocityX) (i32.add (local.get $x) (i32.const 1)) (local.get $y) (local.get $width) (local.get $height))
                    (call $sample (local.get $velocityX) (i32.sub (local.get $x) (i32.const 1)) (local.get $y) (local.get $width) (local.get $height)))
                  (f32.sub
                    (call $sample (local.get $velocityY) (local.get $x) (i32.add (local.get $y) (i32.const 1)) (local.get $width) (local.get $height))
                    (call $sample (local.get $velocityY) (local.get $x) (i32.sub (local.get $y) (i32.const 1)) (local.get $width) (local.get $height))))))
            (call $store (local.get $destination) (local.get $index) (local.get $value))
            (local.set $x (i32.add (local.get $x) (i32.const 1)))
            (br $columns)))
        (local.set $y (i32.add (local.get $y) (i32.const 1)))
        (br $rows))))

  (func (export "pressureJacobi")
    (param $destination i32)
    (param $pressure i32)
    (param $divergence i32)
    (param $width i32)
    (param $height i32)
    (local $x i32)
    (local $y i32)
    (local $index i32)
    (local $sum f32)
    (local.set $y (i32.const 0))
    (block $rowsDone
      (loop $rows
        (br_if $rowsDone (i32.ge_u (local.get $y) (local.get $height)))
        (local.set $x (i32.const 0))
        (block $columnsDone
          (loop $columns
            (br_if $columnsDone (i32.ge_u (local.get $x) (local.get $width)))
            (local.set $index (call $idx (local.get $x) (local.get $y) (local.get $width)))
            (local.set $sum
              (f32.add
                (call $load (local.get $divergence) (local.get $index))
                (f32.add
                  (f32.add
                    (call $sample (local.get $pressure) (i32.sub (local.get $x) (i32.const 1)) (local.get $y) (local.get $width) (local.get $height))
                    (call $sample (local.get $pressure) (i32.add (local.get $x) (i32.const 1)) (local.get $y) (local.get $width) (local.get $height)))
                  (f32.add
                    (call $sample (local.get $pressure) (local.get $x) (i32.sub (local.get $y) (i32.const 1)) (local.get $width) (local.get $height))
                    (call $sample (local.get $pressure) (local.get $x) (i32.add (local.get $y) (i32.const 1)) (local.get $width) (local.get $height))))))
            (call $store
              (local.get $destination)
              (local.get $index)
              (f32.mul (local.get $sum) (f32.const 0.25)))
            (local.set $x (i32.add (local.get $x) (i32.const 1)))
            (br $columns)))
        (local.set $y (i32.add (local.get $y) (i32.const 1)))
        (br $rows))))

  (func (export "subtractGradient")
    (param $velocityX i32)
    (param $velocityY i32)
    (param $pressure i32)
    (param $width i32)
    (param $height i32)
    (local $x i32)
    (local $y i32)
    (local $index i32)
    (local $gradientX f32)
    (local $gradientY f32)
    (local.set $y (i32.const 0))
    (block $rowsDone
      (loop $rows
        (br_if $rowsDone (i32.ge_u (local.get $y) (local.get $height)))
        (local.set $x (i32.const 0))
        (block $columnsDone
          (loop $columns
            (br_if $columnsDone (i32.ge_u (local.get $x) (local.get $width)))
            (local.set $index (call $idx (local.get $x) (local.get $y) (local.get $width)))
            (local.set $gradientX
              (f32.mul
                (f32.const 0.5)
                (f32.sub
                  (call $sample (local.get $pressure) (i32.add (local.get $x) (i32.const 1)) (local.get $y) (local.get $width) (local.get $height))
                  (call $sample (local.get $pressure) (i32.sub (local.get $x) (i32.const 1)) (local.get $y) (local.get $width) (local.get $height)))))
            (local.set $gradientY
              (f32.mul
                (f32.const 0.5)
                (f32.sub
                  (call $sample (local.get $pressure) (local.get $x) (i32.add (local.get $y) (i32.const 1)) (local.get $width) (local.get $height))
                  (call $sample (local.get $pressure) (local.get $x) (i32.sub (local.get $y) (i32.const 1)) (local.get $width) (local.get $height)))))
            (call $store
              (local.get $velocityX)
              (local.get $index)
              (f32.sub
                (call $load (local.get $velocityX) (local.get $index))
                (local.get $gradientX)))
            (call $store
              (local.get $velocityY)
              (local.get $index)
              (f32.sub
                (call $load (local.get $velocityY) (local.get $index))
                (local.get $gradientY)))
            (local.set $x (i32.add (local.get $x) (i32.const 1)))
            (br $columns)))
        (local.set $y (i32.add (local.get $y) (i32.const 1)))
        (br $rows))))

  (func (export "curl")
    (param $destination i32)
    (param $velocityX i32)
    (param $velocityY i32)
    (param $width i32)
    (param $height i32)
    (local $x i32)
    (local $y i32)
    (local $index i32)
    (local $value f32)
    (local.set $y (i32.const 0))
    (block $rowsDone
      (loop $rows
        (br_if $rowsDone (i32.ge_u (local.get $y) (local.get $height)))
        (local.set $x (i32.const 0))
        (block $columnsDone
          (loop $columns
            (br_if $columnsDone (i32.ge_u (local.get $x) (local.get $width)))
            (local.set $index (call $idx (local.get $x) (local.get $y) (local.get $width)))
            (local.set $value
              (f32.mul
                (f32.const 0.5)
                (f32.sub
                  (f32.sub
                    (call $sample (local.get $velocityY) (i32.add (local.get $x) (i32.const 1)) (local.get $y) (local.get $width) (local.get $height))
                    (call $sample (local.get $velocityY) (i32.sub (local.get $x) (i32.const 1)) (local.get $y) (local.get $width) (local.get $height)))
                  (f32.sub
                    (call $sample (local.get $velocityX) (local.get $x) (i32.add (local.get $y) (i32.const 1)) (local.get $width) (local.get $height))
                    (call $sample (local.get $velocityX) (local.get $x) (i32.sub (local.get $y) (i32.const 1)) (local.get $width) (local.get $height))))))
            (call $store (local.get $destination) (local.get $index) (local.get $value))
            (local.set $x (i32.add (local.get $x) (i32.const 1)))
            (br $columns)))
        (local.set $y (i32.add (local.get $y) (i32.const 1)))
        (br $rows))))

  (func (export "vorticity")
    (param $velocityX i32)
    (param $velocityY i32)
    (param $curlField i32)
    (param $width i32)
    (param $height i32)
    (param $strength f32)
    (param $timeStep f32)
    (local $x i32)
    (local $y i32)
    (local $index i32)
    (local $gradientX f32)
    (local $gradientY f32)
    (local $length f32)
    (local $curlValue f32)
    (local $forceX f32)
    (local $forceY f32)
    (local.set $y (i32.const 0))
    (block $rowsDone
      (loop $rows
        (br_if $rowsDone (i32.ge_u (local.get $y) (local.get $height)))
        (local.set $x (i32.const 0))
        (block $columnsDone
          (loop $columns
            (br_if $columnsDone (i32.ge_u (local.get $x) (local.get $width)))
            (local.set $index (call $idx (local.get $x) (local.get $y) (local.get $width)))
            (local.set $gradientX
              (f32.mul
                (f32.const 0.5)
                (f32.sub
                  (f32.abs (call $sample (local.get $curlField) (i32.add (local.get $x) (i32.const 1)) (local.get $y) (local.get $width) (local.get $height)))
                  (f32.abs (call $sample (local.get $curlField) (i32.sub (local.get $x) (i32.const 1)) (local.get $y) (local.get $width) (local.get $height))))))
            (local.set $gradientY
              (f32.mul
                (f32.const 0.5)
                (f32.sub
                  (f32.abs (call $sample (local.get $curlField) (local.get $x) (i32.add (local.get $y) (i32.const 1)) (local.get $width) (local.get $height)))
                  (f32.abs (call $sample (local.get $curlField) (local.get $x) (i32.sub (local.get $y) (i32.const 1)) (local.get $width) (local.get $height))))))
            (local.set $length
              (f32.add
                (f32.sqrt
                  (f32.add
                    (f32.mul (local.get $gradientX) (local.get $gradientX))
                    (f32.mul (local.get $gradientY) (local.get $gradientY))))
                (f32.const 0.00001)))
            (local.set $gradientX (f32.div (local.get $gradientX) (local.get $length)))
            (local.set $gradientY (f32.div (local.get $gradientY) (local.get $length)))
            (local.set $curlValue (call $load (local.get $curlField) (local.get $index)))
            (local.set $forceX
              (f32.mul
                (f32.mul (local.get $gradientY) (local.get $curlValue))
                (local.get $strength)))
            (local.set $forceY
              (f32.mul
                (f32.mul (f32.neg (local.get $gradientX)) (local.get $curlValue))
                (local.get $strength)))
            (call $store
              (local.get $velocityX)
              (local.get $index)
              (f32.add
                (call $load (local.get $velocityX) (local.get $index))
                (f32.mul (local.get $forceX) (local.get $timeStep))))
            (call $store
              (local.get $velocityY)
              (local.get $index)
              (f32.add
                (call $load (local.get $velocityY) (local.get $index))
                (f32.mul (local.get $forceY) (local.get $timeStep))))
            (local.set $x (i32.add (local.get $x) (i32.const 1)))
            (br $columns)))
        (local.set $y (i32.add (local.get $y) (i32.const 1)))
        (br $rows))))

  (func (export "splat")
    (param $velocityX i32)
    (param $velocityY i32)
    (param $red i32)
    (param $green i32)
    (param $blue i32)
    (param $width i32)
    (param $height i32)
    (param $centerX f32)
    (param $centerY f32)
    (param $forceX f32)
    (param $forceY f32)
    (param $radius f32)
    (param $colorR f32)
    (param $colorG f32)
    (param $colorB f32)
    (local $x i32)
    (local $y i32)
    (local $index i32)
    (local $dx f32)
    (local $dy f32)
    (local $distanceSquared f32)
    (local $radiusSquared f32)
    (local $falloff f32)
    (local.set $radiusSquared (f32.mul (local.get $radius) (local.get $radius)))
    (local.set $y (i32.const 0))
    (block $rowsDone
      (loop $rows
        (br_if $rowsDone (i32.ge_u (local.get $y) (local.get $height)))
        (local.set $x (i32.const 0))
        (block $columnsDone
          (loop $columns
            (br_if $columnsDone (i32.ge_u (local.get $x) (local.get $width)))
            (local.set $dx (f32.sub (f32.convert_i32_s (local.get $x)) (local.get $centerX)))
            (local.set $dy (f32.sub (f32.convert_i32_s (local.get $y)) (local.get $centerY)))
            (local.set $distanceSquared
              (f32.add
                (f32.mul (local.get $dx) (local.get $dx))
                (f32.mul (local.get $dy) (local.get $dy))))
            (if (f32.lt (local.get $distanceSquared) (local.get $radiusSquared))
              (then
                (local.set $index (call $idx (local.get $x) (local.get $y) (local.get $width)))
                (local.set $falloff
                  (f32.sub
                    (f32.const 1)
                    (f32.div (local.get $distanceSquared) (local.get $radiusSquared))))
                (local.set $falloff (f32.mul (local.get $falloff) (local.get $falloff)))
                (call $store (local.get $velocityX) (local.get $index)
                  (f32.add (call $load (local.get $velocityX) (local.get $index)) (f32.mul (local.get $forceX) (local.get $falloff))))
                (call $store (local.get $velocityY) (local.get $index)
                  (f32.add (call $load (local.get $velocityY) (local.get $index)) (f32.mul (local.get $forceY) (local.get $falloff))))
                (call $store (local.get $red) (local.get $index)
                  (f32.add (call $load (local.get $red) (local.get $index)) (f32.mul (local.get $colorR) (local.get $falloff))))
                (call $store (local.get $green) (local.get $index)
                  (f32.add (call $load (local.get $green) (local.get $index)) (f32.mul (local.get $colorG) (local.get $falloff))))
                (call $store (local.get $blue) (local.get $index)
                  (f32.add (call $load (local.get $blue) (local.get $index)) (f32.mul (local.get $colorB) (local.get $falloff))))))
            (local.set $x (i32.add (local.get $x) (i32.const 1)))
            (br $columns)))
        (local.set $y (i32.add (local.get $y) (i32.const 1)))
        (br $rows))))

  (func (export "energy")
    (param $velocityX i32)
    (param $velocityY i32)
    (param $length i32)
    (result f32)
    (local $index i32)
    (local $sum f32)
    (local $u f32)
    (local $v f32)
    (local.set $index (i32.const 0))
    (local.set $sum (f32.const 0))
    (block $done
      (loop $loop
        (br_if $done (i32.ge_u (local.get $index) (local.get $length)))
        (local.set $u (call $load (local.get $velocityX) (local.get $index)))
        (local.set $v (call $load (local.get $velocityY) (local.get $index)))
        (local.set $sum
          (f32.add
            (local.get $sum)
            (f32.add
              (f32.mul (local.get $u) (local.get $u))
              (f32.mul (local.get $v) (local.get $v)))))
        (local.set $index (i32.add (local.get $index) (i32.const 1)))
        (br $loop)))
    (f32.mul (local.get $sum) (f32.const 0.5)))
)`;

export const REQUIRED_FLUID_EXPORTS = Object.freeze([
  'memory',
  'clear',
  'copy',
  'scale',
  'advect',
  'divergence',
  'pressureJacobi',
  'subtractGradient',
  'curl',
  'vorticity',
  'splat',
  'energy',
]);
