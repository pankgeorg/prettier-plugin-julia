module Foo

export S, T

abstract type A{T} end
struct S{T<:Real} <: A{T}
    x::T
    y::Vector{T}   # the ys
end
mutable struct M
    a
end
struct Empty end
primitive type P 8 end
const C = 3

end # module
