if a > b
    x
elseif a < b
    y
else
    z
end
for i in 1:n
    s += i
end
for (i, x) in enumerate(xs), j ∈ 1:3
    println(i, x, j)
end
while x < 10
    x += 1
end
try
    f()
catch err
    @warn "failed" err
finally
    close(io)
end
try
    f()
catch
end
let a = 1, b = 2
    a + b
end
let
    x = 1
end
begin
    a
    b
end
y = if c
    1
else
    2
end
open("f") do io
    read(io)
end
z = a ? b : c
return
