"use client";

import { useState, useEffect } from "react";
import {
    Box,
    Card,
    HStack,
    VStack,
    Text,
    Heading,
    Button,
    Input,
    SimpleGrid,
    Icon,
    Flex,
    Badge,
    Table,
    Dialog,
    Portal,
    CloseButton,
    NativeSelect,
    Pagination,
} from "@chakra-ui/react";
import {
    LuPlus,
    LuSearch,
    LuPackage,
    LuEye,
    LuPencil,
    LuTrash2,
    LuTriangleAlert,
    LuChevronLeft,
    LuChevronRight,
} from "react-icons/lu";
import { ScannerButton } from "@/components/scanner/ScannerButton";
import Link from "next/link";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { toaster } from "@/components/ui/toaster";
import { apiClient } from "@/lib/api";
import { ProductResponse, InventoryPaginatedResponse, InventoryStatusSummary } from "@/types/api";

interface CategoryResponse {
    id: string;
    name: string;
}

function getStatusColor(status: string) {
    switch (status) {
        case "In Stock": return "green";
        case "Low Stock": return "yellow";
        case "Out of Stock": return "red";
        default: return "gray";
    }
}

export default function InventoryPage() {
    const PAGE_SIZE = 100;
    const router = useRouter();
    const [products, setProducts] = useState<ProductResponse[]>([]);
    const [categories, setCategories] = useState<CategoryResponse[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalProducts, setTotalProducts] = useState(0);
    const [statusSummary, setStatusSummary] = useState<InventoryStatusSummary>({
        inStock: 0,
        lowStock: 0,
        outOfStock: 0,
    });
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [productToDelete, setProductToDelete] = useState<ProductResponse | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        fetchCategories();
    }, []);

    useEffect(() => {
        fetchProducts(currentPage);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentPage, selectedCategory, selectedStatus, searchQuery]);

    const fetchCategories = async () => {
        try {
            const response = await apiClient.get<CategoryResponse[]>("/api/categories");
            if (response.success && response.data) {
                setCategories(response.data);
            }
        } catch (error) {
            console.error("Failed to fetch categories:", error);
        }
    };

    const fetchProducts = async (page: number = 1) => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams();
            if (searchQuery) params.append('search', searchQuery);
            if (selectedCategory && selectedCategory !== 'All') params.append('category', selectedCategory);
            if (selectedStatus && selectedStatus !== 'All') params.append('status', selectedStatus);
            params.append('page', page.toString());
            params.append('limit', PAGE_SIZE.toString());

            const response = await apiClient.get<InventoryPaginatedResponse>(`/api/inventory?${params.toString()}`);
            if (response.success && response.data) {
                setProducts(response.data.data);
                setTotalProducts(response.data.pagination.total);
                setTotalPages(Math.max(1, response.data.pagination.totalPages));
                setStatusSummary(response.data.summary);
            }
        } catch (error) {
            toaster.create({
                title: "Failed to load products",
                description: "Please try again later",
                type: "error",
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleSearch = () => {
        setCurrentPage(1);
        fetchProducts(1);
    };

    const stats = [
        { label: "Total Products", value: totalProducts.toString(), color: "orange" },
        { label: "In Stock", value: statusSummary.inStock.toString(), color: "green" },
        { label: "Low Stock", value: statusSummary.lowStock.toString(), color: "yellow" },
        { label: "Out of Stock", value: statusSummary.outOfStock.toString(), color: "red" },
    ];

    const lowStockCount = statusSummary.lowStock + statusSummary.outOfStock;

    const openDeleteDialog = (product: typeof products[0]) => {
        setProductToDelete(product);
        setDeleteDialogOpen(true);
    };

    const handleDelete = async () => {
        if (!productToDelete) return;

        setIsDeleting(true);
        setDeleteDialogOpen(false);
        toaster.create({
            id: "deleting-product",
            title: "Deleting product...",
            type: "loading",
        });

        try {
            const response = await apiClient.delete(`/api/inventory/${productToDelete.id}`);
            if (response.success) {
                toaster.dismiss("deleting-product");
                toaster.create({
                    title: "Product deleted",
                    description: `${productToDelete.name} has been removed from inventory.`,
                    type: "success",
                });

                if (products.length === 1 && currentPage > 1) {
                    setCurrentPage(currentPage - 1);
                } else {
                    fetchProducts(currentPage);
                }
            } else {
                throw new Error(response.error || "Failed to delete product");
            }
        } catch (error) {
            toaster.dismiss("deleting-product");
            toaster.create({
                title: "Failed to delete product",
                description: error instanceof Error ? error.message : "Please try again",
                type: "error",
            });
        } finally {
            setIsDeleting(false);
            setProductToDelete(null);
        }
    };

    return (
        <DashboardLayout>
            <VStack gap={6} align="stretch">
                {/* Header */}
                <Flex justify="space-between" align="center" flexWrap="wrap" gap={4}>
                    <Box>
                        <Heading size={{ base: "lg", md: "xl" }} fontWeight="semibold">Inventory</Heading>
                        <Text color="fg.muted" fontSize="sm">
                            Manage your products and stock levels
                        </Text>
                    </Box>
                    <HStack gap={2} flexWrap="wrap">
                        <Link href="/dashboard/inventory/create">
                            <Button colorPalette="orange" size="sm">
                                <LuPlus /> <Text display={{ base: "none", sm: "inline" }}>Add Product</Text>
                            </Button>
                        </Link>
                    </HStack>
                </Flex>


                {lowStockCount > 0 && (
                    <Card.Root
                        bg="orange.500/10"
                        borderWidth="1px"
                        borderColor="orange.200"
                        transition="all 0.2s"
                        _hover={{ shadow: "md" }}
                    >
                        <Card.Body p={4}>
                            <Flex gap={3} align="center" flexWrap="wrap">
                                <Icon color="orange.500" fontSize="lg"><LuTriangleAlert /></Icon>
                                <Box flex={1}>
                                    <Text fontWeight="medium" color="orange.800">
                                        {lowStockCount} products need attention
                                    </Text>
                                    <Text fontSize="sm" color="orange.600">
                                        Some products are running low or out of stock
                                    </Text>
                                </Box>
                                <Button
                                    size="xs"
                                    variant="outline"
                                    colorPalette="orange"
                                    onClick={() => {
                                        setSelectedStatus("Low Stock");
                                        setCurrentPage(1);
                                    }}
                                >
                                    View All
                                </Button>
                            </Flex>
                        </Card.Body>
                    </Card.Root>
                )}

                {/* Stats */}
                <SimpleGrid columns={{ base: 2, md: 4 }} gap={4}>
                    {stats.map((stat) => (
                        <Card.Root
                            key={stat.label}
                            bg="bg.surface"
                            borderWidth="1px"
                            borderColor="border.default"
                            transition="all 0.2s"
                            _hover={{ shadow: "md", transform: "translateY(-2px)" }}
                            cursor="pointer"
                        >
                            <Card.Body p={4}>
                                <VStack align="start" gap={1}>
                                    <Text color="fg.muted" fontSize="xs" fontWeight="medium">
                                        {stat.label}
                                    </Text>
                                    <Text fontSize={{ base: "lg", md: "xl" }} fontWeight="semibold" color={`${stat.color}.600`}>
                                        {stat.value}
                                    </Text>
                                </VStack>
                            </Card.Body>
                        </Card.Root>
                    ))}
                </SimpleGrid>

                {/* Filters & Search */}
                <Card.Root bg="bg.surface" borderWidth="1px" borderColor="border.default">
                    <Card.Body p={4}>
                        <Flex gap={4} flexWrap="wrap" align="center">
                            <HStack flex={1} minW="200px">
                                <Icon color="fg.subtle"><LuSearch /></Icon>
                                <Input
                                    placeholder="Search products..."
                                    variant="flushed"
                                    size="sm"
                                    value={searchQuery}
                                    onChange={(e) => {
                                        setSearchQuery(e.target.value);
                                        setCurrentPage(1);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            handleSearch();
                                        }
                                    }}
                                />
                                <ScannerButton
                                    onScan={async (barcode) => {
                                        try {
                                            const response = await apiClient.get<ProductResponse>(`/api/inventory/search-by-sku?sku=${encodeURIComponent(barcode)}`);
                                            if (response.success && response.data) {
                                                router.push(`/dashboard/inventory/${response.data.id}`);
                                                toaster.create({
                                                    title: "Product found",
                                                    description: `Navigating to ${response.data.name}`,
                                                    type: "success",
                                                });
                                            } else {
                                                toaster.create({
                                                    title: "Product not found",
                                                    description: `No product found with SKU: ${barcode}`,
                                                    type: "error",
                                                });
                                            }
                                        } catch (error) {
                                            toaster.create({
                                                title: "Scan failed",
                                                description: error instanceof Error ? error.message : "Failed to search for product",
                                                type: "error",
                                            });
                                        }
                                    }}
                                    size="sm"
                                    variant="outline"
                                />
                            </HStack>
                            <VStack align="start" gap={2}>
                                <Text fontSize="xs" color="fg.muted" fontWeight="medium">Category</Text>
                                <Box w="100%" maxW="300px">
                                    <NativeSelect.Root size="sm">
                                        <NativeSelect.Field
                                            placeholder="All Categories"
                                            value={selectedCategory || ""}
                                            onChange={(e) => {
                                                const value = e.target.value;
                                                setSelectedCategory(value === "" ? null : value);
                                                setCurrentPage(1);
                                            }}
                                        >
                                            <option value="">All Categories</option>
                                            {categories.map((cat) => (
                                                <option key={cat.id} value={cat.name}>
                                                    {cat.name}
                                                </option>
                                            ))}
                                        </NativeSelect.Field>
                                    </NativeSelect.Root>
                                </Box>
                            </VStack>
                            <VStack align="start" gap={2}>
                                <Text fontSize="xs" color="fg.muted" fontWeight="medium">Status</Text>
                                <HStack gap={2} flexWrap="wrap">
                                    {["All", "In Stock", "Low Stock", "Out of Stock"].map((status) => (
                                        <Button
                                            key={status}
                                            size="xs"
                                            variant={selectedStatus === (status === "All" ? null : status) || (status === "All" && !selectedStatus) ? "solid" : "outline"}
                                            colorPalette={status === "All" ? "gray" : getStatusColor(status)}
                                            onClick={() => {
                                                setSelectedStatus(status === "All" ? null : status);
                                                setCurrentPage(1);
                                            }}
                                            transition="all 0.15s"
                                        >
                                            {status}
                                        </Button>
                                    ))}
                                </HStack>
                            </VStack>
                        </Flex>
                    </Card.Body>
                </Card.Root>

                {/* Products Table */}
                <Card.Root bg="bg.surface" borderWidth="1px" borderColor="border.default" overflow="hidden">
                    <Box overflowX="auto">
                        <Table.Root size="sm" minW="800px">
                            <Table.Header>
                                <Table.Row bg="bg.subtle">
                                    <Table.ColumnHeader fontWeight="semibold" fontSize="xs" color="fg.muted">Product</Table.ColumnHeader>
                                    <Table.ColumnHeader fontWeight="semibold" fontSize="xs" color="fg.muted">SKU</Table.ColumnHeader>
                                    <Table.ColumnHeader fontWeight="semibold" fontSize="xs" color="fg.muted">Category</Table.ColumnHeader>
                                    <Table.ColumnHeader fontWeight="semibold" fontSize="xs" color="fg.muted">Stock</Table.ColumnHeader>
                                    <Table.ColumnHeader fontWeight="semibold" fontSize="xs" color="fg.muted">Price</Table.ColumnHeader>
                                    <Table.ColumnHeader fontWeight="semibold" fontSize="xs" color="fg.muted">Expiry Date</Table.ColumnHeader>
                                    <Table.ColumnHeader fontWeight="semibold" fontSize="xs" color="fg.muted">Status</Table.ColumnHeader>
                                    <Table.ColumnHeader fontWeight="semibold" fontSize="xs" color="fg.muted" textAlign="right">Actions</Table.ColumnHeader>
                                </Table.Row>
                            </Table.Header>
                            <Table.Body>
                                {isLoading ? (
                                    <Table.Row>
                                        <Table.Cell colSpan={8} textAlign="center" py={8}>
                                            <Text color="fg.muted">Loading products...</Text>
                                        </Table.Cell>
                                    </Table.Row>
                                ) : products.length === 0 ? (
                                    <Table.Row>
                                        <Table.Cell colSpan={8} textAlign="center" py={8}>
                                            <Text color="fg.muted">No products found</Text>
                                        </Table.Cell>
                                    </Table.Row>
                                ) : (
                                    products.map((product) => (
                                        <Table.Row
                                            key={product.id}
                                            _hover={{ bg: "bg.subtle" }}
                                            transition="background 0.15s"
                                        >
                                            <Table.Cell>
                                                <HStack gap={3}>
                                                    <Flex
                                                        w={8}
                                                        h={8}
                                                        borderRadius="lg"
                                                        bg="orange.500/10"
                                                        align="center"
                                                        justify="center"
                                                    >
                                                        <Icon color="orange.500" fontSize="sm"><LuPackage /></Icon>
                                                    </Flex>
                                                    <VStack align="start" gap={0}>
                                                        <Text fontWeight="medium" fontSize="sm">{product.name}</Text>
                                                        <Text fontSize="xs" color="fg.muted">{product.id}</Text>
                                                    </VStack>
                                                </HStack>
                                            </Table.Cell>
                                            <Table.Cell>
                                                <Text fontSize="sm" fontFamily="mono">{product.sku}</Text>
                                            </Table.Cell>
                                            <Table.Cell>
                                                <Badge variant="outline" size="sm">{product.category}</Badge>
                                            </Table.Cell>
                                            <Table.Cell>
                                                <Text
                                                    fontWeight="semibold"
                                                    fontSize="sm"
                                                    color={product.stock === 0 ? "red.500" : product.stock < 15 ? "orange.500" : "gray.700"}
                                                >
                                                    {product.stock}
                                                </Text>
                                            </Table.Cell>
                                            <Table.Cell>
                                                <Text fontWeight="medium" fontSize="sm">QAR {product.sellingPrice.toFixed(2)}</Text>
                                            </Table.Cell>
                                            <Table.Cell>
                                                {product.expiryDate ? (
                                                    <Text
                                                        fontSize="sm"
                                                        fontWeight="medium"
                                                        color={
                                                            new Date(product.expiryDate) < new Date()
                                                                ? "red.600"
                                                                : new Date(product.expiryDate) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                                                                    ? "orange.600"
                                                                    : "gray.700"
                                                        }
                                                    >
                                                        {new Date(product.expiryDate).toLocaleDateString()}
                                                    </Text>
                                                ) : (
                                                    <Text fontSize="sm" color="fg.subtle">N/A</Text>
                                                )}
                                            </Table.Cell>
                                            <Table.Cell>
                                                <Badge
                                                    size="sm"
                                                    colorPalette={getStatusColor(product.status)}
                                                    variant="subtle"
                                                >
                                                    {product.status}
                                                </Badge>
                                            </Table.Cell>
                                            <Table.Cell textAlign="right">
                                                <HStack gap={1} justify="flex-end">
                                                    <Link href={`/dashboard/inventory/${product.id}`}>
                                                        <Button variant="ghost" size="xs" _hover={{ bg: "blue.500/10", color: "blue.600" }}>
                                                            <LuEye />
                                                        </Button>
                                                    </Link>
                                                    <Link href={`/dashboard/inventory/${product.id}/edit`}>
                                                        <Button variant="ghost" size="xs" _hover={{ bg: "bg.muted" }}>
                                                            <LuPencil />
                                                        </Button>
                                                    </Link>
                                                    <Button
                                                        variant="ghost"
                                                        size="xs"
                                                        colorPalette="red"
                                                        onClick={() => openDeleteDialog(product)}
                                                        _hover={{ bg: "red.500/10" }}
                                                    >
                                                        <LuTrash2 />
                                                    </Button>
                                                </HStack>
                                            </Table.Cell>
                                        </Table.Row>
                                    ))
                                )}
                            </Table.Body>
                        </Table.Root>
                    </Box>

                    {totalPages > 1 && (
                        <Flex justify="flex-end" p={4} borderTopWidth="1px" borderColor="border.default">
                            <HStack gap={3} align="center">
                                <Text fontSize="sm" color="fg.muted">
                                    Page {currentPage} of {totalPages}
                                </Text>
                                <Pagination.Root
                                    count={totalProducts}
                                    pageSize={PAGE_SIZE}
                                    page={currentPage}
                                    onPageChange={(details) => setCurrentPage(details.page)}
                                    siblingCount={1}
                                >
                                    <HStack gap={1}>
                                        <Pagination.PrevTrigger asChild>
                                            <Button size="sm" variant="outline" disabled={isLoading}>
                                                <LuChevronLeft />
                                            </Button>
                                        </Pagination.PrevTrigger>

                                        <Pagination.Items
                                            render={(page) => (
                                                <Button
                                                    size="sm"
                                                    minW="9"
                                                    variant={page.value === currentPage ? "solid" : "outline"}
                                                    colorPalette={page.value === currentPage ? "orange" : "gray"}
                                                    disabled={isLoading}
                                                >
                                                    {page.value}
                                                </Button>
                                            )}
                                        />

                                        <Pagination.NextTrigger asChild>
                                            <Button size="sm" variant="outline" disabled={isLoading}>
                                                <LuChevronRight />
                                            </Button>
                                        </Pagination.NextTrigger>
                                    </HStack>
                                </Pagination.Root>
                            </HStack>
                        </Flex>
                    )}
                </Card.Root>

                {/* Empty State */}
                {!isLoading && products.length === 0 && (
                    <Card.Root bg="bg.surface" borderWidth="1px" borderColor="border.default">
                        <Card.Body p={10}>
                            <VStack gap={4}>
                                <Flex
                                    w={16}
                                    h={16}
                                    borderRadius="full"
                                    bg="bg.muted"
                                    align="center"
                                    justify="center"
                                >
                                    <Icon fontSize="2xl" color="fg.subtle"><LuPackage /></Icon>
                                </Flex>
                                <VStack gap={1}>
                                    <Text fontWeight="medium">No products found</Text>
                                    <Text fontSize="sm" color="fg.muted">Try adjusting your search or filters</Text>
                                </VStack>
                                <Link href="/dashboard/inventory/create">
                                    <Button colorPalette="orange" size="sm">
                                        <LuPlus /> Add Product
                                    </Button>
                                </Link>
                            </VStack>
                        </Card.Body>
                    </Card.Root>
                )}
            </VStack>

            {/* Delete Confirmation Dialog */}
            <Dialog.Root
                open={deleteDialogOpen}
                onOpenChange={(e) => setDeleteDialogOpen(e.open)}
                role="alertdialog"
            >
                <Portal>
                    <Dialog.Backdrop bg="blackAlpha.600" />
                    <Dialog.Positioner>
                        <Dialog.Content bg="bg.surface" borderRadius="xl" mx={4}>
                            <Dialog.Header p={6} pb={4}>
                                <Dialog.Title fontWeight="semibold">Delete Product</Dialog.Title>
                            </Dialog.Header>
                            <Dialog.Body px={6} pb={6}>
                                <Text color="fg.muted">
                                    Are you sure you want to delete <Text as="span" fontWeight="semibold">{productToDelete?.name}</Text>?
                                    This action cannot be undone.
                                </Text>
                            </Dialog.Body>
                            <Dialog.Footer p={6} pt={4} gap={3}>
                                <Dialog.ActionTrigger asChild>
                                    <Button variant="outline" disabled={isDeleting}>
                                        Cancel
                                    </Button>
                                </Dialog.ActionTrigger>
                                <Button
                                    colorPalette="red"
                                    onClick={handleDelete}
                                    loading={isDeleting}
                                    loadingText="Deleting..."
                                >
                                    <LuTrash2 /> Delete
                                </Button>
                            </Dialog.Footer>
                            <Dialog.CloseTrigger asChild position="absolute" top={4} right={4}>
                                <CloseButton size="sm" />
                            </Dialog.CloseTrigger>
                        </Dialog.Content>
                    </Dialog.Positioner>
                </Portal>
            </Dialog.Root>
        </DashboardLayout>
    );
}
