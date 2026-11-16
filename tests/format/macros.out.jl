@inbounds for i in eachindex(x)
    x[i] = 0
end
@testset "suite" begin
    @test 1 + 1 == 2
    @test_throws ErrorException error("x")
end
@time f(x)
@show(a, b)
@assert x > 0 "x must be positive"
@kwdef struct K
    a::Int = 1
end
@NamedTuple{a::Int, b::Float64}
Base.@kwdef struct B end
q = quote
    x + 1
end
e = :(a + b)
s = :sym
@eval $(Symbol(:f, i))(x) = x
